use std::sync::Arc;

use crate::auth::AuthConfig;

#[derive(Clone)]
pub struct AppState {
    pub config: AuthConfig,
    pub redis: crate::auth::redis::RedisPool,
    pub http: reqwest::Client,
    pub db: mongodb::Database,
}

impl axum::extract::FromRef<Arc<AppState>> for AppState {
    fn from_ref(state: &Arc<AppState>) -> Self {
        state.as_ref().clone()
    }
}
