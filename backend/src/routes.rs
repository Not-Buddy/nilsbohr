use axum::{
    extract::Json,
    http::{StatusCode, header},
    response::IntoResponse,
};
use chrono::Utc;
use git2::Repository;
use std::path::Path;
use std::sync::Arc;
use tokio::task;
use tracing::{error, info, instrument, warn};

use crate::auth::{AppState, AuthUser};
use crate::models::{RepoRequest, WorldResponse};
use crate::parser::generate_world;
use crate::db::{repository, world};

#[instrument(skip(state, auth_user))]
pub async fn parse_repo_handler(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<RepoRequest>,
) -> impl IntoResponse {
    info!(
        user = %auth_user.username,
        github_id = auth_user.github_id,
        "Starting job for repo: {}", payload.url
    );

    let project_name = payload
        .url
        .split('/')
        .next_back()
        .unwrap_or("project")
        .replace(".git", "");

    let (owner, repo_name) = match repository::parse_github_url(&payload.url) {
        Some((o, r)) => (o, r),
        None => {
            error!("Failed to parse GitHub URL: {}", payload.url);
            return (StatusCode::BAD_REQUEST, "Invalid GitHub URL").into_response();
        }
    };

    let gh_token: Option<String> = crate::auth::redis::get_github_token(
        &state.redis,
        auth_user.github_id,
    )
    .await
    .unwrap_or(None);

    let gh_token_ref: Option<&str> = gh_token.as_deref();

    let (gh_metadata, default_branch) = match repository::fetch_github_metadata(
        &state.http,
        &owner,
        &repo_name,
        gh_token_ref,
    )
    .await
    {
        Ok((meta, branch)) => {
            info!("Fetched GitHub metadata for {}/{}", owner, repo_name);
            (Some(meta), branch)
        }
        Err(e) => {
            warn!("Could not fetch GitHub metadata: {e}");
            (None, "main".to_string())
        }
    };

    let latest_commit_hash = match repository::fetch_latest_commit_hash(
        &state.http,
        &owner,
        &repo_name,
        &default_branch,
        gh_token_ref,
    )
    .await
    {
        Ok(hash) => hash,
        Err(e) => {
            warn!("Could not fetch latest commit hash: {e}");
            String::new()
        }
    };

    let repo_doc = repository::find_or_create_repo(
        &state.db,
        &payload.url,
        &project_name,
        &owner,
        &repo_name,
        &auth_user.github_id.to_string(),
    )
    .await;

    let repo_doc = match repo_doc {
        Ok(doc) => doc,
        Err(e) => {
            error!("Database error finding/creating repo: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response();
        }
    };

    let repo_id = match repo_doc.id {
        Some(id) => id,
        None => {
            error!("Repository document missing ID");
            return (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response();
        }
    };

    if !latest_commit_hash.is_empty()
        && repo_doc.latest_commit_hash.as_deref() == Some(&latest_commit_hash)
    {
        info!(
            commit = %latest_commit_hash,
            "Checking for cached world"
        );
        match world::get_cached_world(&state.db, repo_id, &latest_commit_hash).await {
            Ok(Some(seed)) => {
                info!("Cache hit for {}/{}@{}", owner, repo_name, latest_commit_hash);
                let result = WorldResponse {
                    project_name,
                    generated_at: Utc::now().to_rfc3339(),
                    seed,
                };
                return match serde_json::to_string_pretty(&result) {
                    Ok(pretty_json) => (
                        StatusCode::OK,
                        [(header::CONTENT_TYPE, "application/json")],
                        pretty_json,
                    )
                        .into_response(),
                    Err(e) => {
                        error!("JSON Serialization failed: {}", e);
                        (StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error")
                            .into_response()
                    }
                };
            }
            Ok(None) => {
                info!("No cache found for this commit, will clone and parse");
            }
            Err(e) => {
                warn!("Error checking cache: {e}, will clone and parse");
            }
        }
    }

    let temp_dir = match tempfile::tempdir() {
        Ok(d) => d,
        Err(e) => {
            error!("Failed to create temp directory: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, "Internal Error").into_response();
        }
    };

    let clone_path = temp_dir.path().join("repo");
    let clone_url = payload.url.clone();

    info!("Cloning {}/{} to temp directory", owner, repo_name);
    let clone_result = task::spawn_blocking(move || {
        Repository::clone(&clone_url, &clone_path)
    })
    .await;

    let repo_path = match clone_result {
        Ok(Ok(repo)) => {
            let path_buf = repo.path().parent().unwrap_or(Path::new("")).to_path_buf();
            drop(repo);
            path_buf
        }
        Ok(Err(e)) => {
            error!("Git clone failed: {e}");
            return (StatusCode::BAD_REQUEST, format!("Git clone failed: {e}")).into_response();
        }
        Err(e) => {
            error!("Git clone task failed: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, "Git clone failed").into_response();
        }
    };

    info!("Starting AST traversal for {}/{}", owner, repo_name);

    let world_seed = match task::spawn_blocking(move || generate_world(&repo_path)).await {
        Ok(seed) => seed,
        Err(e) => {
            error!("Parsing task failed: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, "Parsing failed").into_response();
        }
    };

    info!(
        cities = world_seed.world_meta.total_cities,
        buildings = world_seed.world_meta.total_buildings,
        rooms = world_seed.world_meta.total_rooms,
        "Parsing complete for {}/{}", owner, repo_name
    );

    if !latest_commit_hash.is_empty() {
        let hash = latest_commit_hash.clone();
        let seed = world_seed.clone();
        let db = state.db.clone();
        let repo_id_clone = repo_id;
        let metadata_clone = gh_metadata.clone();
        let branch_clone = default_branch.clone();

        tokio::spawn(async move {
            let total_loc = calculate_total_loc(&seed);
            match world::store_world(&db, repo_id_clone, &hash, &seed, total_loc).await {
                Ok(_) => info!("Stored parsed world in MongoDB for {hash}"),
                Err(e) => warn!("Failed to store world in MongoDB: {e}"),
            }

            if let Err(e) = repository::update_repo_after_parse(
                &db,
                repo_id_clone,
                &hash,
                &branch_clone,
                metadata_clone,
            )
            .await
            {
                warn!("Failed to update repo after parse: {e}");
            }
        });
    }

    drop(temp_dir);

    let result = WorldResponse {
        project_name,
        generated_at: Utc::now().to_rfc3339(),
        seed: world_seed,
    };

    match serde_json::to_string_pretty(&result) {
        Ok(pretty_json) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "application/json")],
            pretty_json,
        )
            .into_response(),
        Err(e) => {
            error!("JSON Serialization failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error").into_response()
        }
    }
}

fn calculate_total_loc(seed: &crate::models::WorldSeed) -> u32 {
    seed.cities
        .iter()
        .fold(0, |acc, city| {
            let (_, _, _, loc) = city.count_entities();
            acc + loc
        })
}
