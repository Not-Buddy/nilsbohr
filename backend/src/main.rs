use axum::{Router, routing::post};
use tracing::info;
use tracing_subscriber::EnvFilter;

mod languages;
mod models;
mod parser;
mod routes;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    info!("Logger initialized");

    let app = Router::new().route("/parse", post(routes::parse_repo_handler));

    let addr = "0.0.0.0:3000";
    info!("Server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
