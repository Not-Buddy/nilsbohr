use std::collections::HashMap;

use crate::models::{GameEntity, Route};
use crate::parser::ParsedFile;

struct DirNode {
    name: String,
    path: String,
    files: Vec<GameEntity>,
    subdirs: HashMap<String, DirNode>,
}

impl DirNode {
    fn new(name: String, path: String) -> Self {
        Self { name, path, files: Vec::new(), subdirs: HashMap::new() }
    }

    fn to_entity(&self) -> GameEntity {
        let mut children = Vec::new();
        children.extend(self.files.clone());
        for subdir in self.subdirs.values() {
            children.push(subdir.to_entity());
        }
        GameEntity::District {
            id: format!("district_{}", self.path.replace('/', "_")),
            name: self.name.clone(),
            path: self.path.clone(),
            children,
        }
    }
}

pub fn reconstruct_hierarchy(files: Vec<ParsedFile>) -> Vec<GameEntity> {
    let mut root = DirNode::new("root".to_string(), "".to_string());

    for file in files {
        if let GameEntity::Building { id, .. } = &file.entity {
            let parts: Vec<&str> = id.split('/').collect();
            let mut current_node = &mut root;
            let mut current_path = String::new();

            if parts.len() > 1 {
                for &part in &parts[..parts.len() - 1] {
                    if !current_path.is_empty() { current_path.push('/'); }
                    current_path.push_str(part);
                    current_node = current_node
                        .subdirs
                        .entry(part.to_string())
                        .or_insert_with(|| DirNode::new(part.to_string(), current_path.clone()));
                }
            }
            current_node.files.push(file.entity);
        }
    }

    let mut result = Vec::new();
    result.extend(root.files);
    for (_, subdir) in root.subdirs {
        result.push(subdir.to_entity());
    }
    result
}

pub fn find_entry_point(children: &[GameEntity], _lang: &str) -> Option<String> {
    for child in children {
        match child {
            GameEntity::Building { children: c, .. } | GameEntity::District { children: c, .. } => {
                if let Some(id) = find_entry_point(c, _lang) {
                    return Some(id);
                }
            }
            GameEntity::Room { id, is_main, .. } if *is_main => {
                return Some(id.clone());
            }
            _ => {}
        }
    }
    None
}

pub fn calculate_complexity_score(buildings: u32, rooms: u32, routes: &[Route]) -> f32 {
    let building_score = (buildings as f32 / 10.0).min(3.0);
    let room_score = (rooms as f32 / 50.0).min(4.0);
    let route_score = (routes.len() as f32 / 100.0).min(3.0);
    (building_score + room_score + route_score).clamp(1.0, 10.0)
}
