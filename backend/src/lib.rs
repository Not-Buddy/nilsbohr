pub mod auth;
pub mod db;
pub mod domain;
pub mod error;
pub mod git_layer;
pub mod hierarchy;
pub mod languages;
pub mod models;
pub mod multiplayer;
pub mod parser;
pub mod routes;
pub mod services;
pub mod state;
pub mod symbol_table;
pub mod walker;

use axum::{Router, response::IntoResponse, routing::get, routing::post};
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, CorsLayer};
use http::{header, Method};

async fn health_check() -> impl IntoResponse {
    axum::Json(serde_json::json!({"status": "healthy"}))
}

pub fn build_app(state: Arc<state::AppState>) -> Router {
    Router::new()
        .route("/parse", post(routes::parse_repo_handler))
        .route("/auth/login", get(auth::routes::login))
        .route("/auth/callback", get(auth::routes::callback))
        .route("/auth/google/login", get(auth::routes::google_login))
        .route("/auth/google/callback", get(auth::routes::google_callback))
        .route("/auth/me", get(auth::routes::me))
        .route("/auth/repos", get(auth::routes::repos))
        .route("/auth/logout", post(auth::routes::logout))
        .route("/parties", post(multiplayer::create_party))
        .route("/parties/:id", get(multiplayer::get_party))
        .route("/ws/parties/:id", get(multiplayer::ws_handler))
        .with_state(state)
        .route("/", get(health_check))
        .route("/health", get(health_check))
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::predicate(
                    |origin: &http::HeaderValue, _request_parts: &http::request::Parts| {
                        let origin_bytes = origin.as_bytes();
                        origin_bytes.starts_with(b"http://localhost:")
                            || origin_bytes.starts_with(b"https://nilsbohr")
                            || origin_bytes == b"http://localhost"
                    },
                ))
                .allow_methods([
                    Method::GET,
                    Method::POST,
                    Method::OPTIONS,
                    Method::PUT,
                    Method::DELETE,
                ])
                .allow_headers([
                    header::CONTENT_TYPE,
                    header::AUTHORIZATION,
                    header::COOKIE,
                    header::ACCEPT,
                    header::ORIGIN,
                ])
                .allow_credentials(true),
        )
}
