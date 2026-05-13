use std::sync::Arc;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use tracing::{error, info};

use crate::auth::models::AuthUser;
use crate::services::auth_service;
use crate::state::AppState;

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
