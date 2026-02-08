use axum::{response::IntoResponse, routing::get, Router, routing::post};
use std::env;
use tower_http::cors::{CorsLayer, AllowOrigin};
use tracing::info;
use tracing_subscriber::EnvFilter;

mod languages;
mod models;
mod parser;
mod routes;

async fn health_check() -> impl IntoResponse {
    axum::Json(serde_json::json!({"status": "healthy"}))
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    info!("Logger initialized");

    let app = Router::new()
        .route("/parse", post(routes::parse_repo_handler))
        .route("/", get(health_check))
        .route("/health", get(health_check))
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::predicate(
                    |origin: &http::HeaderValue, _request_parts: &http::request::Parts| {
                        origin.as_bytes().starts_with(b"http://localhost:")
                            || origin.as_bytes().starts_with(b"https://nilsbohr")
                            || origin.as_bytes() == b"http://localhost"
                            || origin.as_bytes().starts_with(b"https://nilsbohr.vercel.app")
                    }
                ))
                .allow_methods(tower_http::cors::Any)
                .allow_headers(tower_http::cors::Any)
        );

    let port = env::var("PORT")
        .unwrap_or_else(|_| "4000".to_string())
        .parse::<u16>()
        .expect("PORT must be a valid number");

    let addr = format!("0.0.0.0:{}", port);
    info!("Server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
