use crate::git_layer::GitLayer;
use crate::languages::{
    c_parser, cpp_parser, java_parser, js_parser, py_parser, rs_parser, ts_parser,
};
use crate::models::{CityStats, GameEntity, Route, RouteType, WorldMeta, WorldSeed};
use crate::symbol_table::SymbolTable;
use rayon::prelude::*;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{debug, instrument};

// --- Helper to associate file paths with parsed content ---
struct ParsedFile {
    language: String,
    entity: GameEntity,
    loc: u32,
}

#[instrument(skip(path, root_path))]
fn parse_single_file(path: &Path, relative_path: &str, root_path: &Path) -> Option<ParsedFile> {
    let ext = path.extension()?.to_str()?;
    let source_code = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return None,
    };

    let loc = source_code.lines().count() as u32;
    let file_id = relative_path.to_string();

    let (children, imports, lang_tag) = match ext {
        "rs" => {
            let (entities, imports) = rs_parser::parse_rust_code(&source_code, &file_id);
            (entities, imports, "rs")
        }
        "ts" | "tsx" => {
            let (entities, imports) = ts_parser::parse_typescript_code(&source_code, &file_id);
            (entities, imports, "ts")
        }
        "js" | "jsx" => {
            let (entities, imports) = js_parser::parse_javascript_code(&source_code, &file_id);
            (entities, imports, "js")
        }
        "py" => {
            let (entities, imports) = py_parser::parse_python_code(&source_code, &file_id);
            (entities, imports, "py")
        }
        "cpp" | "cc" | "cxx" | "hpp" => {
            let (entities, imports) = cpp_parser::parse_cpp_code(&source_code, &file_id);
            (entities, imports, "cpp")
        }
        "c" | "h" => {
            let (entities, imports) = c_parser::parse_c_code(&source_code, &file_id);
            (entities, imports, "c")
        }
        "java" => {
            let (entities, imports) = java_parser::parse_java_code(&source_code, &file_id);
            (entities, imports, "java")
        }
        _ => return None,
    };

    let file_entity = GameEntity::Building {
        id: file_id,
        name: path.file_name()?.to_str()?.to_string(),
        building_type: "file".to_string(),
        is_public: true,
        loc,
        imports,
        children,
        metadata: None,
    };

    // --- FETCH GIT METADATA ---
    // Instantiate GitLayer locally to avoid Send/Sync issues with parallel processing
    let git_layer = GitLayer::new(root_path);
    let git_metadata = git_layer.get_file_metadata(path);

    // --- ATTACH METADATA TO ENTITIES ---
    // The top-level entity returned by language parsers is usually a list of entities found in the file.
    // However, `file_entity` created above acts as a wrapper for the file itself.
    // If we want to attach metadata to the file entity:
    let mut file_entity = file_entity;
    if let Some(metadata) = git_metadata {
        if let GameEntity::Building { metadata: m, .. } = &mut file_entity {
            *m = Some(metadata);
        }
    }

    Some(ParsedFile {
        language: lang_tag.to_string(),
        entity: file_entity,
        loc,
    })
}

/// Recursively collects all file paths
fn collect_file_paths(dir: &Path, results: &mut Vec<PathBuf>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();

            // Check if it's a file with a supported extension before checking if it's hidden
            let is_supported_file = !path.is_dir() && {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    matches!(
                        ext,
                        "rs" | "ts"
                            | "tsx"
                            | "js"
                            | "jsx"
                            | "py"
                            | "cpp"
                            | "cc"
                            | "cxx"
                            | "hpp"
                            | "c"
                            | "h"
                            | "java"
                    )
                } else {
                    false
                }
            };

            // Skip hidden files/folders unless they have a supported extension
            if !is_supported_file
                && path
                    .file_name()
                    .map(|s| s.to_string_lossy().starts_with('.'))
                    .unwrap_or(false)
            {
                continue;
            }

            // Skip common non-source directories
            let skip_dirs = [
                "node_modules",
                "target",
                "dist",
                "build",
                "__pycache__",
                ".git",
                "vendor",
            ];
            if path.is_dir() {
                if let Some(name) = path.file_name()
                    && skip_dirs.contains(&name.to_string_lossy().as_ref())
                {
                    continue;
                }
                collect_file_paths(&path, results);
            } else if is_supported_file {
                results.push(path);
            }
        }
    }
}

/// Get city theme based on language
fn get_city_theme(lang: &str) -> &'static str {
    match lang {
        "rs" => "industrial",                         // Rust = Industrial/Steampunk
        "ts" | "tsx" => "neon",                       // TypeScript = Cyberpunk/Neon
        "js" | "jsx" => "retro",                      // JavaScript = Retro/Classic
        "py" => "nature",                             // Python = Nature/Organic
        "go" => "minimalist",                         // Go = Clean/Minimalist
        "cpp" | "cc" | "cxx" | "hpp" => "mechanical", // C++ = Mechanical/Engineering
        "c" | "h" => "assembly",                      // C = Low-level/Assembly
        "java" => "enterprise",                       // Java = Enterprise/Business
        _ => "default",
    }
}

/// Get city name based on language
fn get_city_name(lang: &str) -> &'static str {
    match lang {
        "rs" => "Rustopolis",
        "ts" | "tsx" => "Typescriptia",
        "js" | "jsx" => "Javascriptura",
        "py" => "Pythonia",
        "go" => "Golangton",
        "cpp" | "cc" | "cxx" | "hpp" => "Cppolis",
        "c" | "h" => "Cville",
        "java" => "Javapolis",
        _ => "Unknown Lands",
    }
}

/// The Main Function: Transforms a folder into a WorldSeed
#[instrument(skip(root_path))]
pub fn generate_world(root_path: &Path) -> WorldSeed {
    let mut file_paths = Vec::new();
    collect_file_paths(root_path, &mut file_paths);

    // Parallel Parse
    let all_files: Vec<ParsedFile> = file_paths
        .par_iter()
        .filter_map(|path| {
            let relative_path = path.strip_prefix(root_path).unwrap_or(path);
            let relative_str = relative_path.to_string_lossy().to_string();
            parse_single_file(path, &relative_str, root_path)
        })
        .collect();

    // Group files by language
    let mut city_map: HashMap<String, Vec<ParsedFile>> = HashMap::new();
    for file in all_files {
        city_map
            .entry(file.language.clone())
            .or_default()
            .push(file);
    }

    let mut cities = Vec::new();
    let mut all_routes = Vec::new();
    let mut route_counter = 0;

    // Track for dominant language
    let mut lang_loc: HashMap<String, u32> = HashMap::new();

    // Build a City for each language
    for (lang, files) in city_map {
        debug!("Building City for language: {}", lang);

        let total_loc: u32 = files.iter().map(|f| f.loc).sum();
        *lang_loc.entry(lang.clone()).or_default() += total_loc;

        // Reconstruct the directory tree for this language
        let city_children = reconstruct_hierarchy(files);

        // Calculate city stats
        let (buildings, rooms, artifacts, loc) =
            city_children.iter().fold((0, 0, 0, 0), |acc, child| {
                let (b, r, a, l) = child.count_entities();
                (acc.0 + b, acc.1 + r, acc.2 + a, acc.3 + l)
            });

        // Find entry point (main function)
        let entry_point_id = find_entry_point(&city_children, &lang);

        let city = GameEntity::City {
            id: format!("city_{}", lang),
            name: get_city_name(&lang).to_string(),
            language: lang.clone(),
            theme: get_city_theme(&lang).to_string(),
            entry_point_id,
            stats: CityStats {
                building_count: buildings,
                room_count: rooms,
                artifact_count: artifacts,
                loc,
            },
            children: city_children,
        };

        // Collect routes from this city
        let call_routes = city.collect_calls();
        for (from, to) in call_routes {
            all_routes.push(Route {
                id: format!("route_{}", route_counter),
                from_id: from,
                to_id: to,
                route_type: RouteType::FunctionCall,
                bidirectional: false,
                metadata: None,
            });
            route_counter += 1;
        }

        let import_routes = city.collect_imports();
        for (from, to) in import_routes {
            all_routes.push(Route {
                id: format!("route_{}", route_counter),
                from_id: from,
                to_id: to,
                route_type: RouteType::Import,
                bidirectional: false,
                metadata: None,
            });
            route_counter += 1;
        }

        cities.push(city);
    }

    // --- RESOLUTION PHASE ---
    debug!("Indexing symbols for resolution...");
    let mut symbol_table = SymbolTable::new();
    symbol_table.index_cities(&cities);

    debug!("Resolving routes...");
    let mut resolved_routes = Vec::new();

    for route in all_routes {
        // The 'to_id' is currently just a raw symbol name (e.g. "my_func")
        // We need to resolve it to a real ID (e.g. "src/start.rs::my_func")
        // Pass context_file_id (from_id often starts with file path)
        if let Some(resolved_to) = symbol_table.resolve(&route.to_id, &route.from_id) {
            resolved_routes.push(Route {
                to_id: resolved_to,
                ..route
            });
        }
    }

    // Calculate world metadata
    let (total_buildings, total_rooms, total_artifacts, _) =
        cities.iter().fold((0, 0, 0, 0), |acc, city| {
            let (b, r, a, l) = city.count_entities();
            (acc.0 + b, acc.1 + r, acc.2 + a, acc.3 + l)
        });

    let dominant_language = lang_loc
        .into_iter()
        .max_by_key(|(_, loc)| *loc)
        .map(|(lang, _)| lang)
        .unwrap_or_default();

    // Calculate complexity score (simple heuristic)
    let complexity_score =
        calculate_complexity_score(total_buildings, total_rooms, &resolved_routes);

    WorldSeed {
        world_meta: WorldMeta {
            total_cities: cities.len() as u32,
            total_buildings,
            total_rooms,
            total_artifacts,
            dominant_language,
            complexity_score,
        },
        cities,
        highways: resolved_routes,
    }
}

/// Find the main entry point for a language
fn find_entry_point(children: &[GameEntity], _lang: &str) -> Option<String> {
    for child in children {
        match child {
            GameEntity::Building { children, .. } | GameEntity::District { children, .. } => {
                if let Some(id) = find_entry_point(children, _lang) {
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

/// Calculate a complexity score for the project (1-10)
fn calculate_complexity_score(buildings: u32, rooms: u32, routes: &[Route]) -> f32 {
    let building_score = (buildings as f32 / 10.0).min(3.0);
    let room_score = (rooms as f32 / 50.0).min(4.0);
    let route_score = (routes.len() as f32 / 100.0).min(3.0);

    (building_score + room_score + route_score).clamp(1.0, 10.0)
}

struct DirNode {
    name: String,
    path: String,
    files: Vec<GameEntity>,
    subdirs: HashMap<String, DirNode>,
}

impl DirNode {
    fn new(name: String, path: String) -> Self {
        Self {
            name,
            path,
            files: Vec::new(),
            subdirs: HashMap::new(),
        }
    }

    fn to_entity(self) -> GameEntity {
        let mut children = Vec::new();
        children.extend(self.files);
        for (_, subdir) in self.subdirs {
            children.push(subdir.to_entity());
        }

        GameEntity::District {
            id: format!("district_{}", self.path.replace('/', "_")),
            name: self.name,
            path: self.path,
            children,
        }
    }
}

/// Helper: Turns a list of paths + files into a TRUE nested District/Building tree
fn reconstruct_hierarchy(files: Vec<ParsedFile>) -> Vec<GameEntity> {
    let mut root = DirNode::new("root".to_string(), "".to_string());

    for file in files {
        // Get the parent directory path
        let path_str = file.path.to_string_lossy();
        let _relative_path = path_str.as_ref();


        // Extract parent directory from the file's ID
        if let GameEntity::Building { id, .. } = &file.entity {
            let parts: Vec<&str> = id.split('/').collect();

            // Navigate the directory tree
            let mut current_node = &mut root;

            // Build path incrementally
            let mut current_path = String::new();

            // Handle parent directories (all parts except the last one, which is the file)
            if parts.len() > 1 {
                for &part in &parts[..parts.len() - 1] {
                    if !current_path.is_empty() {
                        current_path.push('/');
                    }
                    current_path.push_str(part);

                    current_node = current_node
                        .subdirs
                        .entry(part.to_string())
                        .or_insert_with(|| DirNode::new(part.to_string(), current_path.clone()));
                }
            }

            // Add file to the leaf node
            current_node.files.push(file.entity);
        }
    }

    // Convert root children (we don't want a "root" district wrapping everything if possible)
    let mut result = Vec::new();
    result.extend(root.files);
    for (_, subdir) in root.subdirs {
        result.push(subdir.to_entity());
    }
    result
}
