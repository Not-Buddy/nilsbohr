use axum::{
    extract::Json, 
    http::{StatusCode, header}, // Added 'header'
    response::IntoResponse
};
use chrono::Utc;
use git2::Repository;
use tempfile::TempDir;
use tracing::{error, info, instrument};

use crate::models::{RepoRequest, WorldResponse};
use crate::parser::generate_world;

#[instrument]
pub async fn parse_repo_handler(Json(payload): Json<RepoRequest>) -> impl IntoResponse {
    info!("Starting job for repo: {}", payload.url);

    let temp_dir = match TempDir::new() {
        Ok(dir) => dir,
        Err(e) => {
            error!("Failed to create temp dir: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, "Internal Error").into_response();
        }
    };

    info!(path = ?temp_dir.path(), "Cloning repository...");
    match Repository::clone(&payload.url, temp_dir.path()) {
        Ok(_) => info!("Clone successful"),
        Err(e) => {
            error!("Git clone failed: {}", e);
            return (StatusCode::BAD_REQUEST, format!("Git clone failed: {}", e)).into_response();
        }
    };

    info!("Starting AST traversal");
    let world_seed = generate_world(temp_dir.path());
    info!(
        cities = world_seed.world_meta.total_cities,
        buildings = world_seed.world_meta.total_buildings,
        rooms = world_seed.world_meta.total_rooms,
        "Parsing complete"
    );

    let project_name = payload
        .url
        .split('/')
        .last()
        .unwrap_or("project")
        .replace(".git", "");

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
            ).into_response()
        },
        Err(e) => {
            error!("JSON Serialization failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error").into_response()
        }
    }
}