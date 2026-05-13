use chrono::Utc;
use futures::TryStreamExt;
use mongodb::Database;
use mongodb::bson::{doc, oid::ObjectId};
use std::collections::HashMap;
use tracing::{info, warn};

use super::models::{EntityDoc, ParsedWorldDoc, RouteDoc};
use crate::models::{GameEntity, Route, WorldMeta, WorldSeed};

pub async fn get_cached_world(
    db: &Database,
    repository_id: ObjectId,
    commit_hash: &str,
) -> Result<Option<WorldSeed>, String> {
    let worlds_collection = db.collection::<ParsedWorldDoc>("parsed_worlds");
    let world = worlds_collection
        .find_one(doc! { "repository_id": repository_id, "commit_hash": commit_hash })
        .await
        .map_err(|e| e.to_string())?;

    let Some(world_doc) = world else {
        return Ok(None);
    };

    let world_id = world_doc.id.ok_or("world doc has no id")?;

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

    let cities = reconstruct_tree(&entities);

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

    info!(
        commit = %commit_hash,
        "Returning cached world from MongoDB"
    );
    Ok(Some(world_seed))
}

pub async fn store_world(
    db: &Database,
    repository_id: ObjectId,
    commit_hash: &str,
    world_seed: &WorldSeed,
    _total_loc: u32,
) -> Result<ObjectId, String> {
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
    let insert_result = worlds_collection
        .insert_one(&world_doc)
        .await
        .map_err(|e| e.to_string())?;
    let world_id = insert_result
        .inserted_id
        .as_object_id()
        .ok_or("Failed to get world ID")?;

    let (entities, entity_count) = flatten_entities(&world_seed.cities, world_id);
    let routes = build_route_docs(&world_seed.highways, world_id);

    if !entities.is_empty() {
        let entities_collection = db.collection::<EntityDoc>("entities");

        for chunk in entities.chunks(500) {
            entities_collection
                .insert_many(chunk.to_vec())
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    if !routes.is_empty() {
        let routes_collection = db.collection::<RouteDoc>("routes");
        for chunk in routes.chunks(500) {
            routes_collection
                .insert_many(chunk.to_vec())
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    worlds_collection
        .update_one(
            doc! { "_id": world_id },
            doc! { "$set": { "entity_count": entity_count as u32, "route_count": world_seed.highways.len() as u32 } },
        )
        .await
        .map_err(|e| e.to_string())?;

    info!(
        world_id = %world_id,
        entities = entity_count,
        routes = world_seed.highways.len(),
        "Stored world in MongoDB"
    );

    Ok(world_id)
}

fn flatten_entities(entities: &[GameEntity], world_id: ObjectId) -> (Vec<EntityDoc>, usize) {
    let mut docs = Vec::new();
    let mut order: i32 = 0;

    for entity in entities {
        flatten_recursive(entity, None, world_id, &mut order, &mut docs);
    }

    let count = docs.len();
    (docs, count)
}

fn flatten_recursive(
    entity: &GameEntity,
    parent_entity_id: Option<String>,
    world_id: ObjectId,
    order: &mut i32,
    docs: &mut Vec<EntityDoc>,
) {
    let (parser_id, name, entity_type, loc, children, _has_own_children) = extract_entity_info(entity);

    let current_entity_id = parser_id.to_string();
    let current_order = *order;
    *order += 1;

    let entity_without_children = strip_children(entity);

    docs.push(EntityDoc {
        id: Some(ObjectId::new()),
        world_id,
        entity_id: current_entity_id.clone(),
        parent_entity_id,
        name,
        entity_type,
        sort_order: current_order,
        loc,
        entity: entity_without_children,
    });

    for child in children {
        flatten_recursive(child, Some(current_entity_id.clone()), world_id, order, docs);
    }
}

fn extract_entity_info(entity: &GameEntity) -> (&str, String, String, u32, &[GameEntity], bool) {
    match entity {
        GameEntity::City {
            id,
            name,
            children,
            stats,
            ..
        } => (id, name.clone(), "City".to_string(), stats.loc, children.as_slice(), !children.is_empty()),
        GameEntity::District {
            id,
            name,
            children,
            ..
        } => (id, name.clone(), "District".to_string(), 0, children.as_slice(), !children.is_empty()),
        GameEntity::Building {
            id,
            name,
            loc,
            children,
            ..
        } => (id, name.clone(), "Building".to_string(), *loc, children.as_slice(), !children.is_empty()),
        GameEntity::Room {
            id,
            name,
            loc,
            children,
            ..
        } => (id, name.clone(), "Room".to_string(), *loc, children.as_slice(), !children.is_empty()),
        GameEntity::Artifact { id, name, .. } => {
            (id, name.clone(), "Artifact".to_string(), 0, &[], false)
        }
    }
}

fn strip_children(entity: &GameEntity) -> GameEntity {
    let mut cloned = entity.clone();
    match &mut cloned {
        GameEntity::City { children, .. } => *children = Vec::new(),
        GameEntity::District { children, .. } => *children = Vec::new(),
        GameEntity::Building { children, .. } => *children = Vec::new(),
        GameEntity::Room { children, .. } => *children = Vec::new(),
        GameEntity::Artifact { .. } => {}
    }
    cloned
}

fn build_route_docs(routes: &[Route], world_id: ObjectId) -> Vec<RouteDoc> {
    routes
        .iter()
        .map(|route| RouteDoc {
            id: None,
            world_id,
            route: route.clone(),
        })
        .collect()
}

async fn fetch_entities(db: &Database, world_id: ObjectId) -> Result<Vec<EntityDoc>, String> {
    let collection = db.collection::<EntityDoc>("entities");
    let cursor = collection
        .find(doc! { "world_id": world_id })
        .sort(doc! { "sort_order": 1 })
        .await
        .map_err(|e| e.to_string())?;

    let entities: Vec<EntityDoc> = cursor.try_collect().await.map_err(|e| e.to_string())?;
    Ok(entities)
}

async fn fetch_routes(db: &Database, world_id: ObjectId) -> Result<Vec<Route>, String> {
    let collection = db.collection::<RouteDoc>("routes");
    let cursor = collection
        .find(doc! { "world_id": world_id })
        .await
        .map_err(|e| e.to_string())?;

    let route_docs: Vec<RouteDoc> = cursor.try_collect().await.map_err(|e| e.to_string())?;
    Ok(route_docs.into_iter().map(|rd| rd.route).collect())
}

fn reconstruct_tree(entities: &[EntityDoc]) -> Vec<GameEntity> {
    let mut entity_map: HashMap<&str, &EntityDoc> = HashMap::new();
    let mut children_map: HashMap<Option<&str>, Vec<&EntityDoc>> = HashMap::new();

    for entity in entities {
        entity_map.insert(&entity.entity_id, entity);
        let parent_id: Option<&str> = entity.parent_entity_id.as_deref();
        children_map.entry(parent_id).or_default().push(entity);
    }

    for (_, siblings) in children_map.iter_mut() {
        siblings.sort_by_key(|e| e.sort_order);
    }

    let root_entities = children_map.get(&None).cloned().unwrap_or_default();

    root_entities
        .iter()
        .map(|doc| build_entity_with_children(*doc, &children_map))
        .collect()
}

fn build_entity_with_children(
    doc: &EntityDoc,
    children_map: &HashMap<Option<&str>, Vec<&EntityDoc>>,
) -> GameEntity {
    let mut entity = doc.entity.clone();
    let child_entities: Vec<GameEntity> = children_map
        .get(&Some(doc.entity_id.as_str()))
        .cloned()
        .unwrap_or_default()
        .iter()
        .map(|child_doc| build_entity_with_children(child_doc, children_map))
        .collect();

    match &mut entity {
        GameEntity::City { children, .. }
        | GameEntity::District { children, .. }
        | GameEntity::Building { children, .. }
        | GameEntity::Room { children, .. } => {
            *children = child_entities;
        }
        GameEntity::Artifact { .. } => {}
    }

    entity
}
