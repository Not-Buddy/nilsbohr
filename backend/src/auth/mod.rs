pub mod config;
pub mod jwt;
pub mod middleware;
pub mod models;
pub mod oauth;
pub mod redis;
pub mod routes;

use std::sync::Arc;

pub use config::AuthConfig;
pub use models::AuthUser;

/// Shared application state for auth-related operations.
#[derive(Clone, Debug)]
pub struct AppState {
    pub config: AuthConfig,
    pub redis: redis::RedisPool,
    pub http: reqwest::Client,
}

impl axum::extract::FromRef<Arc<AppState>> for AppState {
    fn from_ref(state: &Arc<AppState>) -> Self {
        state.as_ref().clone()
    }
}
