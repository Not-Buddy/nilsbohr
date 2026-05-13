use axum::{
    extract::Json,
    http::{StatusCode, header},
    response::IntoResponse,
};
use std::sync::Arc;
use tracing::{error, instrument};

use crate::auth::AuthUser;
use crate::models::RepoRequest;
use crate::services::parse_service;
use crate::state::AppState;

#[instrument(skip(state, auth_user))]
pub async fn parse_repo_handler(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
    auth_user: AuthUser,
    Json(payload): Json<RepoRequest>,
) -> impl IntoResponse {
    match parse_service::parse_repository(&state, &auth_user, &payload.url).await {
        Ok(result) => match serde_json::to_string_pretty(&result) {
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
        },
        Err(app_err) => app_err.into_response(),
    }
}
