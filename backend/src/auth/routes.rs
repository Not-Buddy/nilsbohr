use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Redirect, Response},
};
use chrono::Utc;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{error, info};
use uuid::Uuid;

use super::AppState;
use super::jwt;
use super::models::{AuthUser, Claims, User};
use super::oauth;
use super::redis as auth_redis;

/// Query params for the OAuth callback.
#[derive(serde::Deserialize)]
pub struct CallbackParams {
    code: String,
}

/// GET /auth/login — redirect to GitHub OAuth authorize page.
pub async fn login(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let url = oauth::build_authorize_url(&state.config);
    info!("Redirecting to GitHub OAuth: {}", url);
    Redirect::temporary(&url)
}

/// GET /auth/callback?code=xxx — handle the GitHub OAuth callback.
pub async fn callback(
    State(state): State<Arc<AppState>>,
    Query(params): Query<CallbackParams>,
) -> Response {
    // 1. Exchange code for access token
    let access_token = match oauth::exchange_code(&state.http, &state.config, &params.code).await {
        Ok(token) => token,
        Err(e) => {
            error!("OAuth code exchange failed: {}", e);
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": e })),
            )
                .into_response();
        }
    };

    // 2. Fetch GitHub user profile
    let gh_user = match oauth::fetch_github_user(&state.http, &access_token).await {
        Ok(user) => user,
        Err(e) => {
            error!("GitHub user fetch failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": e })),
            )
                .into_response();
        }
    };

    // 3. Upsert user in Redis
    let now = Utc::now().to_rfc3339();
    let existing = auth_redis::get_user(&state.redis, gh_user.id)
        .await
        .ok()
        .flatten();
    let user = User {
        github_id: gh_user.id,
        username: gh_user.login.clone(),
        display_name: gh_user.name,
        email: gh_user.email,
        avatar_url: gh_user.avatar_url,
        created_at: existing
            .map(|u| u.created_at)
            .unwrap_or_else(|| now.clone()),
        last_login: now,
    };

    if let Err(e) = auth_redis::store_user(&state.redis, &user).await {
        error!("Failed to store user: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Failed to store user" })),
        )
            .into_response();
    }

    // 3.5. Store GitHub access token for future API calls (e.g. listing repos)
    if let Err(e) = auth_redis::store_github_token(&state.redis, user.github_id, &access_token).await {
        error!("Failed to store GitHub token: {}", e);
        // Non-fatal — login can still proceed
    }

    // 4. Create session
    let session_id = Uuid::new_v4().to_string();
    if let Err(e) = auth_redis::store_session(&state.redis, &session_id, user.github_id).await {
        error!("Failed to create session: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Failed to create session" })),
        )
            .into_response();
    }

    // 5. Create JWT
    let now_ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize;

    let claims = Claims {
        sub: user.github_id.to_string(),
        username: user.username.clone(),
        session_id: session_id.clone(),
        iat: now_ts,
        exp: now_ts + auth_redis::SESSION_TTL_SECS as usize,
    };

    let token = match jwt::create_token(&state.config.jwt_secret, &claims) {
        Ok(t) => t,
        Err(e) => {
            error!("JWT creation failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Token creation failed" })),
            )
                .into_response();
        }
    };

    info!(
        github_id = user.github_id,
        username = %user.username,
        session_id = %session_id,
        "User authenticated successfully"
    );

    // 6. Set cookie and redirect to frontend
    let cookie_value = format!(
        "token={}; HttpOnly; SameSite=Lax; Path=/; Max-Age={}",
        token,
        auth_redis::SESSION_TTL_SECS
    );

    let mut headers = HeaderMap::new();
    headers.insert("Set-Cookie", cookie_value.parse().unwrap());
    headers.insert(
        "Location",
        format!("{}/auth/callback?token={}", state.config.frontend_url, token)
            .parse()
            .unwrap(),
    );

    (StatusCode::FOUND, headers).into_response()
}

/// GET /auth/me — return the current user's profile.
pub async fn me(State(state): State<Arc<AppState>>, auth_user: AuthUser) -> Response {
    match auth_redis::get_user(&state.redis, auth_user.github_id).await {
        Ok(Some(user)) => (StatusCode::OK, Json(serde_json::json!(user))).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "User not found" })),
        )
            .into_response(),
        Err(e) => {
            error!("Failed to fetch user: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to fetch user" })),
            )
                .into_response()
        }
    }
}

/// POST /auth/logout — destroy the current session.
pub async fn logout(State(state): State<Arc<AppState>>, auth_user: AuthUser) -> Response {
    if let Err(e) = auth_redis::delete_session(&state.redis, &auth_user.session_id).await {
        error!("Failed to delete session: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": "Logout failed" })),
        )
            .into_response();
    }

    info!(
        github_id = auth_user.github_id,
        session_id = %auth_user.session_id,
        "User logged out"
    );

    // Clear the cookie
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

/// Slim repo info returned to the frontend.
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
    // 1. Get stored GitHub token
    let gh_token = match auth_redis::get_github_token(&state.redis, auth_user.github_id).await {
        Ok(Some(token)) => token,
        Ok(None) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "error": "GitHub token expired — please re-login" })),
            )
                .into_response();
        }
        Err(e) => {
            error!("Failed to get GitHub token: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to retrieve GitHub token" })),
            )
                .into_response();
        }
    };

    // 2. Fetch repos from GitHub API
    let resp = state
        .http
        .get("https://api.github.com/user/repos")
        .query(&[
            ("sort", "updated"),
            ("direction", "desc"),
            ("per_page", "30"),
            ("type", "owner"),
        ])
        .header("Authorization", format!("Bearer {}", gh_token))
        .header("User-Agent", "nilsbohr-backend")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await;

    let resp = match resp {
        Ok(r) => r,
        Err(e) => {
            error!("GitHub repos fetch failed: {}", e);
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": "Failed to fetch repos from GitHub" })),
            )
                .into_response();
        }
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        error!("GitHub repos API error ({}): {}", status, body);
        return (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": format!("GitHub API error: {}", status) })),
        )
            .into_response();
    }

    // 3. Parse and return slim repo list
    let repos: Vec<serde_json::Value> = match resp.json().await {
        Ok(r) => r,
        Err(e) => {
            error!("Failed to parse GitHub repos response: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "Failed to parse repos" })),
            )
                .into_response();
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
