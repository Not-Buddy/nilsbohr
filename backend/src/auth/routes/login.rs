use std::sync::Arc;

use axum::extract::State;
use axum::response::{IntoResponse, Redirect};
use tracing::info;

use crate::services::auth_service;
use crate::state::AppState;

pub async fn login(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let url = auth_service::build_login_url(&state.config);
    info!("Redirecting to GitHub OAuth: {}", url);
    Redirect::temporary(&url)
}
