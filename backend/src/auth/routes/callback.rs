use std::sync::Arc;

use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use tracing::error;

use crate::services::auth_service;
use crate::state::AppState;

use super::CallbackParams;

pub async fn callback(
    State(state): State<Arc<AppState>>,
    Query(params): Query<CallbackParams>,
) -> Response {
    let code = match params.code {
        Some(code) => code,
        None => {
            let err = params.error.unwrap_or_else(|| "unknown".into());
            let redirect = format!("{}/login/callback?error={}", state.config.frontend_url, err);
            return (StatusCode::FOUND, [("Location", redirect.as_str())]).into_response();
        }
    };

    match auth_service::handle_callback(&state, &code).await {
        Ok(result) => {
            let mut headers = HeaderMap::new();
            headers.insert("Set-Cookie", result.cookie_value.parse().unwrap());
            headers.insert("Location", result.redirect_url.parse().unwrap());
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
