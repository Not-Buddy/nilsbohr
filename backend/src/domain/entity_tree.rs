use std::collections::HashMap;

use mongodb::bson::oid::ObjectId;

use crate::db::models::EntityDoc;
use crate::models::GameEntity;

pub fn flatten_entities(entities: &[GameEntity], world_id: ObjectId) -> (Vec<EntityDoc>, usize) {
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
        GameEntity::City { id, name, children, stats, .. } => {
            (id, name.clone(), "City".to_string(), stats.loc, children.as_slice(), !children.is_empty())
        }
        GameEntity::District { id, name, children, .. } => {
            (id, name.clone(), "District".to_string(), 0, children.as_slice(), !children.is_empty())
        }
        GameEntity::Building { id, name, loc, children, .. } => {
            (id, name.clone(), "Building".to_string(), *loc, children.as_slice(), !children.is_empty())
        }
        GameEntity::Room { id, name, loc, children, .. } => {
            (id, name.clone(), "Room".to_string(), *loc, children.as_slice(), !children.is_empty())
        }
        GameEntity::Artifact { id, name, .. } => {
            (id, name.clone(), "Artifact".to_string(), 0, &[], false)
        }
    }
}

fn strip_children(entity: &GameEntity) -> GameEntity {
    let mut cloned = entity.clone();
    match &mut cloned {
        GameEntity::City { children, .. }
        | GameEntity::District { children, .. }
        | GameEntity::Building { children, .. }
        | GameEntity::Room { children, .. } => *children = Vec::new(),
        GameEntity::Artifact { .. } => {}
    }
    cloned
}

pub fn reconstruct_tree(entities: &[EntityDoc]) -> Vec<GameEntity> {
    let mut children_map: HashMap<Option<&str>, Vec<&EntityDoc>> = HashMap::new();

    for entity in entities {
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
