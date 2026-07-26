pub mod models;
pub mod mysql;
pub mod repository;
pub mod world;

use mongodb::{Database, IndexModel};
use mongodb::bson::doc;
use tracing::info;

pub async fn init_db(uri: &str) -> Database {
    let client = mongodb::Client::with_uri_str(uri)
        .await
        .expect("Failed to connect to MongoDB");
    let db = client.database("nilsbohr");

    create_indexes(&db).await;

    info!("MongoDB connected and indexes created");
    db
}

async fn create_indexes(db: &Database) {
    let _ = db
        .collection::<mongodb::bson::Document>("repositories")
        .create_index(
            IndexModel::builder()
                .keys(doc! { "repo_url": 1 })
                .build(),
        )
        .await;

    let _ = db
        .collection::<mongodb::bson::Document>("repositories")
        .create_index(
            IndexModel::builder()
                .keys(doc! { "owner": 1, "repo_name": 1 })
                .build(),
        )
        .await;

    let _ = db
        .collection::<mongodb::bson::Document>("parsed_worlds")
        .create_index(
            IndexModel::builder()
                .keys(doc! { "repository_id": 1, "commit_hash": 1 })
                .build(),
        )
        .await;

    let _ = db
        .collection::<mongodb::bson::Document>("entities")
        .create_index(
            IndexModel::builder()
                .keys(doc! { "world_id": 1, "parent_entity_id": 1 })
                .build(),
        )
        .await;

    let _ = db
        .collection::<mongodb::bson::Document>("entities")
        .create_index(
            IndexModel::builder()
                .keys(doc! { "entity_id": 1 })
                .build(),
        )
        .await;

    let _ = db
        .collection::<mongodb::bson::Document>("routes")
        .create_index(
            IndexModel::builder()
                .keys(doc! { "world_id": 1 })
                .build(),
        )
        .await;
}
