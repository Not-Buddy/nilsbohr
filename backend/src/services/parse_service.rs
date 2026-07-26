use chrono::Utc;
use std::path::Path;
use tokio::task;
use tracing::{error, info, instrument, warn};

use crate::auth::AuthUser;
use crate::db::{repository, world};
use crate::error::AppError;
use crate::models::{WorldResponse, WorldSeed};
use crate::parser::generate_world;
use crate::services::github_service;
use crate::state::AppState;

#[instrument(skip(state, auth_user))]
pub async fn parse_repository(
    state: &AppState,
    auth_user: &AuthUser,
    repo_url: &str,
) -> Result<WorldResponse, AppError> {
    info!(
        user = %auth_user.username,
        github_id = auth_user.github_id,
        "Starting job for repo: {repo_url}"
    );

    let project_name = repo_url
        .split('/')
        .next_back()
        .unwrap_or("project")
        .replace(".git", "");

    let (owner, repo_name) =
        github_service::parse_github_url(repo_url).ok_or_else(|| {
            error!("Failed to parse GitHub URL: {repo_url}");
            AppError::Git("Invalid GitHub URL".into())
        })?;

    let gh_token: Option<String> = crate::auth::redis::get_github_token(
        &state.redis,
        auth_user.github_id,
    )
    .await
    .unwrap_or(None);

    let gh_token_ref: Option<&str> = gh_token.as_deref();

    let (gh_metadata, default_branch) = match github_service::fetch_repo_metadata(
        &state.http,
        &owner,
        &repo_name,
        gh_token_ref,
    )
    .await
    {
        Ok((meta, branch)) => {
            info!("Fetched GitHub metadata for {owner}/{repo_name}");
            (Some(meta), branch)
        }
        Err(e) => {
            warn!("Could not fetch GitHub metadata: {e}");
            (None, "main".to_string())
        }
    };

    let latest_commit_hash = match github_service::fetch_latest_commit_hash(
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
        repo_url,
        &project_name,
        &owner,
        &repo_name,
        &auth_user.github_id.to_string(),
    )
    .await?;

    let repo_id = repo_doc.id.ok_or_else(|| AppError::Internal("Repository document missing ID".into()))?;

    if !latest_commit_hash.is_empty()
        && repo_doc.latest_commit_hash.as_deref() == Some(&latest_commit_hash)
    {
        info!(commit = %latest_commit_hash, "Checking for cached world");
        match world::get_cached_world(&state.db, repo_id, &latest_commit_hash).await {
            Ok(Some(seed)) => {
                info!("Cache hit for {owner}/{repo_name}@{latest_commit_hash}");
                return Ok(WorldResponse {
                    project_name,
                    generated_at: Utc::now().to_rfc3339(),
                    seed,
                });
            }
            Ok(None) => {
                info!("No cache found for this commit, will clone and parse");
            }
            Err(e) => {
                warn!("Error checking cache: {e}, will clone and parse");
            }
        }
    }

    let temp_dir = tempfile::tempdir()
        .map_err(|e| AppError::Internal(format!("Failed to create temp directory: {e}")))?;

    let clone_path = temp_dir.path().join("repo");
    let clone_url = repo_url.to_string();

    info!("Cloning {owner}/{repo_name} to temp directory");
    let clone_result = task::spawn_blocking(move || crate::git_layer::GitLayer::shallow_clone(&clone_url, &clone_path)).await;

    let repo_path = match clone_result {
        Ok(Ok(repo)) => {
            let path_buf = repo
                .path()
                .parent()
                .unwrap_or(Path::new(""))
                .to_path_buf();
            drop(repo);
            path_buf
        }
        Ok(Err(e)) => {
            error!("Git clone failed: {e}");
            return Err(AppError::Git(format!("Git clone failed: {e}")));
        }
        Err(e) => {
            error!("Git clone task failed: {e}");
            return Err(AppError::Internal(format!("Git clone task failed: {e}")));
        }
    };

    info!("Starting AST traversal for {owner}/{repo_name}");

    let world_seed =
        match task::spawn_blocking(move || generate_world(&repo_path)).await {
            Ok(seed) => seed,
            Err(e) => {
                error!("Parsing task failed: {e}");
                return Err(AppError::Parse(format!("Parsing task failed: {e}")));
            }
        };

    info!(
        cities = world_seed.world_meta.total_cities,
        buildings = world_seed.world_meta.total_buildings,
        rooms = world_seed.world_meta.total_rooms,
        "Parsing complete for {owner}/{repo_name}"
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

    Ok(WorldResponse {
        project_name,
        generated_at: Utc::now().to_rfc3339(),
        seed: world_seed,
    })
}

fn calculate_total_loc(seed: &WorldSeed) -> u32 {
    seed.cities.iter().fold(0, |acc, city| {
        let (_, _, _, loc) = city.count_entities();
        acc + loc
    })
}
