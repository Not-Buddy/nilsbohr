use axum::extract::{Query, State};
use axum::response::{IntoResponse, Redirect};
use serde::Deserialize;
use std::sync::Arc;
use tracing::error;

use crate::error::AppError;
use crate::services::auth_service;
use crate::state::AppState;

#[derive(Deserialize)]
pub struct GoogleCallbackParams {
    pub code: String,
}

pub async fn google_callback(
    State(state): State<Arc<AppState>>,
    Query(params): Query<GoogleCallbackParams>,
) -> Result<impl IntoResponse, AppError> {
    match auth_service::handle_google_callback(&state, &params.code).await {
        Ok(result) => Ok(Redirect::temporary(&result.redirect_url).into_response()),
        Err(e) => {
            error!("Google callback failed: {}", e);
            let error_url = format!("{}?error=google_auth_failed", state.config.frontend_url);
            Ok(Redirect::temporary(&error_url).into_response())
        }
    }
}
