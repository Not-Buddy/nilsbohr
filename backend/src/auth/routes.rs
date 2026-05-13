use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Redirect, Response},
};
use std::sync::Arc;
use tracing::{error, info};

use crate::state::AppState;
use crate::services::auth_service;
use super::models::AuthUser;

#[derive(serde::Deserialize)]
pub struct CallbackParams {
    code: String,
}

/// GET /auth/login — redirect to GitHub OAuth authorize page.
pub async fn login(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let url = auth_service::build_login_url(&state.config);
    info!("Redirecting to GitHub OAuth: {}", url);
    Redirect::temporary(&url)
}

/// GET /auth/callback?code=xxx — handle the GitHub OAuth callback.
pub async fn callback(
    State(state): State<Arc<AppState>>,
    Query(params): Query<CallbackParams>,
) -> Response {
    match auth_service::handle_callback(&state, &params.code).await {
        Ok(result) => {
            let mut headers = HeaderMap::new();
            headers.insert("Set-Cookie", result.cookie_value.parse().unwrap());
            headers.insert(
                "Location",
                result.redirect_url.parse().unwrap(),
            );
            (StatusCode::FOUND, headers).into_response()
        }
        Err(e) => {
            error!("OAuth callback failed: {e}");
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

/// GET /auth/me — return the current user's profile.
pub async fn me(State(state): State<Arc<AppState>>, auth_user: AuthUser) -> Response {
    match auth_service::get_user_profile(&state.redis, &auth_user).await {
        Ok(Some(user)) => (StatusCode::OK, Json(serde_json::json!(user))).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "User not found" })),
        )
            .into_response(),
        Err(e) => {
            error!("Failed to fetch user: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

/// POST /auth/logout — destroy the current session.
pub async fn logout(State(_state): State<Arc<AppState>>, auth_user: AuthUser) -> Response {
    if let Err(e) = auth_service::delete_user_session(&_state.redis, &auth_user.session_id).await {
        error!("Failed to delete session: {e}");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response();
    }

    info!(
        github_id = auth_user.github_id,
        session_id = %auth_user.session_id,
        "User logged out"
    );

    let clear_cookie = "token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
    let mut headers = HeaderMap::new();
    headers.insert("Set-Cookie", clear_cookie.parse().unwrap());

    (
        StatusCode::OK,
        headers,
        Json(serde_json::json!({ "status": "logged out" })),
    )
        .into_response()
}

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

/// GET /auth/repos — list the authenticated user's GitHub repos.
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
