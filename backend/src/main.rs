use std::env;
use std::sync::Arc;
use tracing::info;
use tracing_subscriber::EnvFilter;

use backend::auth;
use backend::build_app;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    info!("Logger initialized");

    // Load .env file (silently ignore if missing — e.g. in production)
    dotenvy::dotenv().ok();

    // Initialize auth subsystem
    let auth_config = auth::AuthConfig::from_env();
    let redis_pool = auth::redis::create_pool(&auth_config.redis_url).await;
    let http_client = reqwest::Client::new();

    info!("Redis pool and auth config initialized");

    let state = Arc::new(auth::AppState {
        config: auth_config,
        redis: redis_pool,
        http: http_client,
    });

    let app = build_app(state);

    let port = env::var("PORT")
        .unwrap_or_else(|_| "5000".to_string())
        .parse::<u16>()
        .expect("PORT must be a valid number");

    let addr = format!("0.0.0.0:{}", port);
    info!("Server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
