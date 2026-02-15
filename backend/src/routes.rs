use axum::{
    extract::Json,
    http::{StatusCode, header},
    response::IntoResponse,
};
use chrono::Utc;
use git2::Repository;
use std::fs;
use std::path::Path;
use tokio::task;
use tracing::{error, info, instrument, warn};

use crate::models::{RepoRequest, WorldResponse};
use crate::parser::generate_world;

#[instrument]
pub async fn parse_repo_handler(Json(payload): Json<RepoRequest>) -> impl IntoResponse {
    info!("Starting job for repo: {}", payload.url);

    // Extract project name from URL
    let project_name = payload
        .url
        .split('/')
        .next_back()
        .unwrap_or("project")
        .replace(".git", "");

    // Define the path for the repository
    let repo_path = Path::new("repos").join(&project_name);

    let repo_path_value = repo_path.clone(); // Store the value to use later

    // Check if the repository already exists
    let repo_exists = task::spawn_blocking(move || repo_path_value.exists())
        .await
        .unwrap_or(false);

    if repo_exists {
        info!(
            "Repository already exists, using existing clone at: {:?}",
            repo_path
        );

        // Perform git operations in a blocking task
        let repo_path_clone = repo_path.clone();
        let git_result = task::spawn_blocking(move || {
            // Attempt to open the existing repository
            let repo = match Repository::open(&repo_path_clone) {
                Ok(repo) => repo,
                Err(e) => {
                    return Err(format!("Failed to open existing repository: {}", e));
                }
            };

            // Fetch latest changes from remote
            info!("Fetching latest changes for existing repository...");

            // Determine the default branch name by checking remote HEAD
            let default_branch = match repo.find_remote("origin") {
                Ok(mut remote) => {
                    match remote.fetch(&["+refs/heads/*:refs/remotes/origin/*"], None, None) {
                        Ok(_) => {
                            info!("Successfully fetched all remote branches");

                            // Try to determine the default branch from symbolic reference
                            match repo.find_reference("refs/remotes/origin/HEAD") {
                                Ok(reference) => {
                                    // Extract branch name from symbolic reference like "refs/remotes/origin/main"
                                    match reference.symbolic_target() {
                                        Some(target) => {
                                            target
                                                .strip_prefix("refs/remotes/origin/")
                                                .unwrap_or("main")  // fallback to main if format unexpected
                                                .to_string()
                                        }
                                        None => "main".to_string(),  // fallback if not symbolic
                                    }
                                }
                                Err(_) => {
                                    // If origin/HEAD doesn't exist, try common branch names
                                    for branch_name in &["main", "master", "develop", "trunk"] {
                                        if repo.resolve_reference_from_short_name(branch_name).is_ok() {
                                            info!("Using branch '{}' as default", branch_name);
                                            break;
                                        }
                                    }
                                    "main".to_string()  // fallback
                                }
                            }
                        }
                        Err(e) => {
                            error!("Failed to fetch updates: {}", e);
                            "main".to_string()  // fallback to main
                        }
                    }
                }
                Err(e) => {
                    error!("Failed to find origin remote: {}", e);
                    "main".to_string()  // fallback to main
                }
            };

            // Now update to the correct default branch
            let remote_branch = format!("refs/remotes/origin/{}", default_branch);
            match repo.set_head(&remote_branch) {
                Ok(_) => {
                    match repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force())) {
                        Ok(_) => info!("Checked out latest changes from '{}'", default_branch),
                        Err(e) => {
                            error!("Failed to checkout head after fetch: {}", e);
                            // Continue with existing version if checkout fails
                        }
                    }
                }
                Err(e) => {
                    warn!("Could not set head to {}: {}. Using current state.", remote_branch, e);

                    // Try to use FETCH_HEAD as fallback if available
                    match repo.refname_to_id("FETCH_HEAD") {
                        Ok(fetch_head_id) => {
                            match repo.find_commit(fetch_head_id) {
                                Ok(commit) => {
                                    // Convert commit to object
                                    let obj = commit.into_object();
                                    match repo.reset(&obj, git2::ResetType::Hard, None) {
                                        Ok(_) => info!("Reset to FETCH_HEAD successful"),
                                        Err(e) => {
                                            warn!("Failed to reset to FETCH_HEAD: {}. Using current state.", e);
                                            // Continue with existing version if reset fails
                                        }
                                    }
                                }
                                Err(e) => {
                                    warn!("Could not find FETCH_HEAD commit: {}. Using current state.", e);
                                    // Continue with existing version if FETCH_HEAD commit is not available
                                }
                            }
                        }
                        Err(e) => {
                            warn!("Could not find FETCH_HEAD reference: {}. Using current state.", e);
                            // Continue with existing version if FETCH_HEAD is not available
                        }
                    }
                }
            }
            Ok(())
        }).await;

        match git_result {
            Ok(result) => {
                if let Err(e) = result {
                    error!("{}", e);
                    return (StatusCode::INTERNAL_SERVER_ERROR, "Git operation failed")
                        .into_response();
                }
            }
            Err(e) => {
                error!("Git operation task failed: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, "Git operation failed").into_response();
            }
        }
    } else {
        info!("Repository does not exist, cloning to: {:?}", repo_path);

        // Create the repos directory if it doesn't exist in a blocking task
        let create_dir_result = task::spawn_blocking(|| fs::create_dir_all("repos")).await;

        if let Err(e) = create_dir_result {
            error!("Failed to create repos directory: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Internal Error").into_response();
        }

        if let Err(e) = create_dir_result.unwrap() {
            error!("Failed to create repos directory: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Internal Error").into_response();
        }

        // Clone the repository in a blocking task
        let url = payload.url.clone();
        let repo_path_clone = repo_path.clone();
        let clone_result =
            task::spawn_blocking(move || Repository::clone(&url, &repo_path_clone)).await;

        match clone_result {
            Ok(result) => match result {
                Ok(_) => info!("Clone successful"),
                Err(e) => {
                    error!("Git clone failed: {}", e);
                    return (StatusCode::BAD_REQUEST, format!("Git clone failed: {}", e))
                        .into_response();
                }
            },
            Err(e) => {
                error!("Git clone task failed: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, "Git clone failed").into_response();
            }
        }
    }

    info!("Starting AST traversal");

    // Perform the parsing in a blocking task
    let repo_path_clone = repo_path.clone();
    let world_seed = match task::spawn_blocking(move || generate_world(&repo_path_clone)).await {
        Ok(seed) => seed,
        Err(e) => {
            error!("Parsing task failed: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Parsing failed").into_response();
        }
    };

    info!(
        cities = world_seed.world_meta.total_cities,
        buildings = world_seed.world_meta.total_buildings,
        rooms = world_seed.world_meta.total_rooms,
        "Parsing complete"
    );

    let result = WorldResponse {
        project_name,
        generated_at: Utc::now().to_rfc3339(),
        seed: world_seed,
    };

    // --- CHANGED SECTION: Pretty Print Serialization ---
    match serde_json::to_string_pretty(&result) {
        Ok(pretty_json) => {
            // We manually construct the response with the correct header
            (
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/json")],
                pretty_json,
            )
                .into_response()
        }
        Err(e) => {
            error!("JSON Serialization failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error").into_response()
        }
    }
}
