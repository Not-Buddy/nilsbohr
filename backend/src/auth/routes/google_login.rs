use axum::response::Redirect;
use std::sync::Arc;
use axum::extract::State;

use crate::state::AppState;

pub async fn google_login(State(state): State<Arc<AppState>>) -> Redirect {
    let url = crate::auth::oauth::build_google_authorize_url(&state.config);
    Redirect::temporary(&url)
}
