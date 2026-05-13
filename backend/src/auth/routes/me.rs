use std::sync::Arc;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use tracing::error;

use crate::auth::models::AuthUser;
use crate::services::auth_service;
use crate::state::AppState;

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
