use std::sync::Arc;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use tracing::error;

use crate::auth::models::AuthUser;
use crate::services::auth_service;
use crate::state::AppState;

#[derive(serde::Serialize)]
struct RepoInfo {
    name: String,
    full_name: String,
    html_url: String,
    description: Option<String>,
    language: Option<String>,
    stargazers_count: u32,
    updated_at: String,
    private: bool,
}

pub async fn repos(State(state): State<Arc<AppState>>, auth_user: AuthUser) -> Response {
    let repos = match auth_service::list_user_repos(&state, &auth_user).await {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to list repos: {e}");
            let status = match &e {
                crate::error::AppError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
                _ => StatusCode::BAD_GATEWAY,
            };
            return (status, Json(serde_json::json!({ "error": e.to_string() }))).into_response();
        }
    };

    let slim: Vec<RepoInfo> = repos
        .iter()
        .map(|r| RepoInfo {
            name: r["name"].as_str().unwrap_or_default().to_string(),
            full_name: r["full_name"].as_str().unwrap_or_default().to_string(),
            html_url: r["html_url"].as_str().unwrap_or_default().to_string(),
            description: r["description"].as_str().map(String::from),
            language: r["language"].as_str().map(String::from),
            stargazers_count: r["stargazers_count"].as_u64().unwrap_or(0) as u32,
            updated_at: r["updated_at"].as_str().unwrap_or_default().to_string(),
            private: r["private"].as_bool().unwrap_or(false),
        })
        .collect();

    (StatusCode::OK, Json(slim)).into_response()
}
