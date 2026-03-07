pub mod auth;
pub mod git_layer;
pub mod languages;
pub mod models;
pub mod parser;
pub mod routes;
pub mod symbol_table;

use axum::{Router, response::IntoResponse, routing::get, routing::post};
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, CorsLayer};
use http::{header, Method};

async fn health_check() -> impl IntoResponse {
    axum::Json(serde_json::json!({"status": "healthy"}))
}

/// Build the application router with the given shared state.
/// Extracted so integration tests can create the same app without starting a server.
pub fn build_app(state: Arc<auth::AppState>) -> Router {
    Router::new()
        // Protected route — AuthUser extractor enforces auth
        .route("/parse", post(routes::parse_repo_handler))
        // Auth routes
        .route("/auth/login", get(auth::routes::login))
        .route("/auth/callback", get(auth::routes::callback))
        .route("/auth/me", get(auth::routes::me))
        .route("/auth/repos", get(auth::routes::repos))
        .route("/auth/logout", post(auth::routes::logout))
        .with_state(state)
        // Public routes (no state needed)
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
                    Method::DELETE
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