use chrono::Utc;
use futures::TryStreamExt;
use mongodb::Database;
use mongodb::bson::{doc, oid::ObjectId};
use tracing::{info, warn};

use super::models::{EntityDoc, ParsedWorldDoc, RouteDoc};
use crate::domain::entity_tree;
use crate::error::AppError;
use crate::models::{Route, WorldMeta, WorldSeed};

pub async fn get_cached_world(
    db: &Database,
    repository_id: ObjectId,
    commit_hash: &str,
) -> Result<Option<WorldSeed>, AppError> {
    let worlds_collection = db.collection::<ParsedWorldDoc>("parsed_worlds");
    let world = worlds_collection
        .find_one(doc! { "repository_id": repository_id, "commit_hash": commit_hash })
        .await?;

    let Some(world_doc) = world else {
        return Ok(None);
    };

    let world_id = world_doc.id.ok_or_else(|| AppError::Internal("world doc has no id".into()))?;

    let entities = match fetch_entities(db, world_id).await {
        Ok(e) => e,
        Err(e) => {
            warn!("Failed to deserialize cached entities, removing stale world {}: {e}", world_id);
            let _ = worlds_collection.delete_one(doc! { "_id": world_id }).await;
            let _ = db.collection::<mongodb::bson::Document>("entities").delete_many(doc! { "world_id": world_id }).await;
            let _ = db.collection::<mongodb::bson::Document>("routes").delete_many(doc! { "world_id": world_id }).await;
            return Ok(None);
        }
    };
    let routes = fetch_routes(db, world_id).await?;

    let cities = entity_tree::reconstruct_tree(&entities);

    let world_seed = WorldSeed {
        world_meta: WorldMeta {
            total_cities: world_doc.world_meta_total_cities,
            total_buildings: world_doc.world_meta_total_buildings,
            total_rooms: world_doc.world_meta_total_rooms,
            total_artifacts: world_doc.world_meta_total_artifacts,
            dominant_language: world_doc.world_meta_dominant_language,
            complexity_score: world_doc.world_meta_complexity_score,
        },
        cities,
        highways: routes,
    };

    info!(commit = %commit_hash, "Returning cached world from MongoDB");
    Ok(Some(world_seed))
}

pub async fn store_world(
    db: &Database,
    repository_id: ObjectId,
    commit_hash: &str,
    world_seed: &WorldSeed,
    _total_loc: u32,
) -> Result<ObjectId, AppError> {
    let parsed_at = Utc::now().to_rfc3339();

    let world_doc = ParsedWorldDoc {
        id: None,
        repository_id,
        commit_hash: commit_hash.to_string(),
        parsed_at: parsed_at.clone(),
        world_meta_dominant_language: world_seed.world_meta.dominant_language.clone(),
        world_meta_total_cities: world_seed.world_meta.total_cities,
        world_meta_total_buildings: world_seed.world_meta.total_buildings,
        world_meta_total_rooms: world_seed.world_meta.total_rooms,
        world_meta_total_artifacts: world_seed.world_meta.total_artifacts,
        world_meta_complexity_score: world_seed.world_meta.complexity_score,
        entity_count: 0,
        route_count: world_seed.highways.len() as u32,
    };

    let worlds_collection = db.collection::<ParsedWorldDoc>("parsed_worlds");
    let insert_result = worlds_collection.insert_one(&world_doc).await?;
    let world_id = insert_result
        .inserted_id
        .as_object_id()
        .ok_or_else(|| AppError::Internal("Failed to get world ID".into()))?;

    let (entities, entity_count) = entity_tree::flatten_entities(&world_seed.cities, world_id);
    let routes = build_route_docs(&world_seed.highways, world_id);

    if !entities.is_empty() {
        let entities_collection = db.collection::<EntityDoc>("entities");
        for chunk in entities.chunks(500) {
            entities_collection.insert_many(chunk.to_vec()).await?;
        }
    }

    if !routes.is_empty() {
        let routes_collection = db.collection::<RouteDoc>("routes");
        for chunk in routes.chunks(500) {
            routes_collection.insert_many(chunk.to_vec()).await?;
        }
    }

    worlds_collection
        .update_one(
            doc! { "_id": world_id },
            doc! { "$set": { "entity_count": entity_count as u32, "route_count": world_seed.highways.len() as u32 } },
        )
        .await?;

    info!(world_id = %world_id, entities = entity_count, routes = world_seed.highways.len(), "Stored world in MongoDB");
    Ok(world_id)
}

fn build_route_docs(routes: &[Route], world_id: ObjectId) -> Vec<RouteDoc> {
    routes.iter().map(|route| RouteDoc { id: None, world_id, route: route.clone() }).collect()
}

async fn fetch_entities(db: &Database, world_id: ObjectId) -> Result<Vec<EntityDoc>, AppError> {
    let collection = db.collection::<EntityDoc>("entities");
    let cursor = collection
        .find(doc! { "world_id": world_id })
        .sort(doc! { "sort_order": 1 })
        .await?;
    let entities: Vec<EntityDoc> = cursor.try_collect().await?;
    Ok(entities)
}

async fn fetch_routes(db: &Database, world_id: ObjectId) -> Result<Vec<Route>, AppError> {
    let collection = db.collection::<RouteDoc>("routes");
    let cursor = collection.find(doc! { "world_id": world_id }).await?;
    let route_docs: Vec<RouteDoc> = cursor.try_collect().await?;
    Ok(route_docs.into_iter().map(|rd| rd.route).collect())
}
