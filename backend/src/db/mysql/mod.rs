pub mod models;
pub mod users;

use sqlx::mysql::MySqlPoolOptions;
use tracing::info;

pub async fn init_pool(database_url: &str) -> sqlx::MySqlPool {
    let pool = MySqlPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
        .expect("Failed to connect to MySQL");

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to run MySQL migrations");

    info!("MySQL connected and migrations applied");
    pool
}
