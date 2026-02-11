use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// --- API Request/Response ---

#[derive(Deserialize, Debug)]
pub struct RepoRequest {
    pub url: String,
}

#[derive(Serialize, Debug)]
pub struct WorldResponse {
    pub project_name: String,
    pub generated_at: String,
    pub seed: WorldSeed,
}

// --- World Metadata ---

#[derive(Serialize, Debug, Clone, Default)]
pub struct WorldMeta {
    pub total_cities: u32,
    pub total_buildings: u32,
    pub total_rooms: u32,
    pub total_artifacts: u32,
    pub dominant_language: String,
    pub complexity_score: f32,
}

#[derive(Serialize, Debug, Clone, Default)]
pub struct CityStats {
    pub building_count: u32,
    pub room_count: u32,
    pub artifact_count: u32,
    pub loc: u32,
}

// --- World Seed ---

#[derive(Serialize, Debug, Clone)]
pub struct WorldSeed {
    pub world_meta: WorldMeta,
    pub cities: Vec<GameEntity>,
    pub highways: Vec<Route>,
}

// --- Routes (connections between entities) ---

#[derive(Serialize, Debug, Clone)]
pub struct Route {
    pub id: String,
    pub from_id: String,
    pub to_id: String,
    pub route_type: RouteType,
    pub bidirectional: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

 // RouteType represents relationships between entities.
// Some variants are reserved for future analysis and routing logic.
#[allow(dead_code)]
#[derive(Serialize, Debug, Clone)]
pub enum RouteType {
    FunctionCall,
    Import,
    Inheritance,
    NetworkRequest,
    TypeReference,
}


// --- Function Parameter ---

#[derive(Serialize, Debug, Clone)]
pub struct Parameter {
    pub name: String,
    pub datatype: String,
}

// --- The Game Entities ---

#[derive(Serialize, Debug, Clone)]
#[serde(tag = "kind", content = "spec")]
pub enum GameEntity {
    // 1. The Metropolis (Language Level)
    City {
        id: String,
        name: String,
        language: String,
        theme: String, // "industrial", "neon", "nature", etc.
        entry_point_id: Option<String>,
        stats: CityStats,
        children: Vec<GameEntity>,
    },

    // 2. The Zones (Folder/Module Level)
    District {
        id: String,
        name: String,
        path: String, // relative path to folder
        children: Vec<GameEntity>,
    },

    // 3. The Structures (Class/Struct/File Level)
    Building {
        id: String,
        name: String,
        building_type: String, // "struct", "class", "interface", "file"
        is_public: bool,
        loc: u32,
        imports: Vec<String>, // IDs of imported buildings
        children: Vec<GameEntity>,
        #[serde(skip_serializing_if = "Option::is_none")]
        metadata: Option<HashMap<String, String>>,
    },

    // 4. The Logic Centers (Function Level)
    Room {
        id: String,
        name: String,
        room_type: String, // "function", "method", "closure", "impl_block"
        is_main: bool,
        is_async: bool,
        visibility: String, // "public", "private", "protected"
        complexity: u32,
        loc: u32,
        parameters: Vec<Parameter>,
        return_type: Option<String>,
        calls: Vec<String>, // IDs of functions this calls
        children: Vec<GameEntity>,
        #[serde(skip_serializing_if = "Option::is_none")]
        metadata: Option<HashMap<String, String>>,
    },

    // 5. The Loot/Items (Variable Level)
    Artifact {
        id: String,
        name: String,
        artifact_type: String, // "variable", "constant", "field", "parameter"
        datatype: String,
        is_mutable: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        value_hint: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        metadata: Option<HashMap<String, String>>,
    },
}

// --- Helper implementations ---

impl GameEntity {
    /// Count all nested entities of each type
    pub fn count_entities(&self) -> (u32, u32, u32, u32) {
        // Returns: (buildings, rooms, artifacts, loc)
        match self {
            GameEntity::City { children, .. } => {
                children.iter().fold((0, 0, 0, 0), |acc, child| {
                    let (b, r, a, l) = child.count_entities();
                    (acc.0 + b, acc.1 + r, acc.2 + a, acc.3 + l)
                })
            }
            GameEntity::District { children, .. } => {
                children.iter().fold((0, 0, 0, 0), |acc, child| {
                    let (b, r, a, l) = child.count_entities();
                    (acc.0 + b, acc.1 + r, acc.2 + a, acc.3 + l)
                })
            }
            GameEntity::Building { children, loc, .. } => {
                let (b, r, a, l) = children.iter().fold((0, 0, 0, 0), |acc, child| {
                    let (b, r, a, l) = child.count_entities();
                    (acc.0 + b, acc.1 + r, acc.2 + a, acc.3 + l)
                });
                (1 + b, r, a, *loc + l)
            }
            GameEntity::Room { children, loc, .. } => {
                let (b, r, a, l) = children.iter().fold((0, 0, 0, 0), |acc, child| {
                    let (b, r, a, l) = child.count_entities();
                    (acc.0 + b, acc.1 + r, acc.2 + a, acc.3 + l)
                });
                (b, 1 + r, a, *loc + l)
            }
            GameEntity::Artifact { .. } => (0, 0, 1, 0),
        }
    }

    /// Collect all function calls from rooms (for route generation)
    pub fn collect_calls(&self) -> Vec<(String, String)> {
        // Returns: Vec<(from_id, to_id)>
        match self {
            GameEntity::Room {
                id,
                calls,
                children,
                ..
            } => {
                let mut result: Vec<(String, String)> =
                    calls.iter().map(|to| (id.clone(), to.clone())).collect();
                for child in children {
                    result.extend(child.collect_calls());
                }
                result
            }
            GameEntity::City { children, .. }
            | GameEntity::District { children, .. }
            | GameEntity::Building { children, .. } => {
                children.iter().flat_map(|c| c.collect_calls()).collect()
            }
            GameEntity::Artifact { .. } => vec![],
        }
    }

    /// Collect all imports from buildings (for route generation)
    pub fn collect_imports(&self) -> Vec<(String, String)> {
        // Returns: Vec<(from_id, to_id)>
        match self {
            GameEntity::Building {
                id,
                imports,
                children,
                ..
            } => {
                let mut result: Vec<(String, String)> =
                    imports.iter().map(|to| (id.clone(), to.clone())).collect();
                for child in children {
                    result.extend(child.collect_imports());
                }
                result
            }
            GameEntity::City { children, .. } | GameEntity::District { children, .. } => {
                children.iter().flat_map(|c| c.collect_imports()).collect()
            }
            GameEntity::Room { children, .. } => {
                children.iter().flat_map(|c| c.collect_imports()).collect()
            }
            GameEntity::Artifact { .. } => vec![],
        }
    }
}
