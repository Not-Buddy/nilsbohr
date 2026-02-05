use crate::languages::{
    c_parser, cpp_parser, java_parser, js_parser, py_parser, rs_parser, ts_parser,
};
use crate::models::{CityStats, GameEntity, Route, RouteType, WorldMeta, WorldSeed};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tracing::{debug, instrument};

// --- Helper to associate file paths with parsed content ---
struct ParsedFile {
    path: PathBuf,
    language: String,
    entity: GameEntity,
    loc: u32,
}

#[instrument(skip(path))]
fn parse_single_file(path: &Path, relative_path: &str) -> Option<ParsedFile> {
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
    };

    Some(ParsedFile {
        path: path.to_path_buf(),
        language: lang_tag.to_string(),
        entity: file_entity,
        loc,
    })
}

/// Recursively collects all parsed files into a flat list
fn collect_files(dir: &Path, root_dir: &Path, results: &mut Vec<ParsedFile>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();

            // Skip hidden files/folders
            if path
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
            ];
            if path.is_dir() {
                if let Some(name) = path.file_name() {
                    if skip_dirs.contains(&name.to_string_lossy().as_ref()) {
                        continue;
                    }
                }
                collect_files(&path, root_dir, results);
            } else {
                let relative_path = path.strip_prefix(root_dir).unwrap_or(&path);
                let relative_str = relative_path.to_string_lossy().to_string();

                if let Some(parsed) = parse_single_file(&path, &relative_str) {
                    results.push(parsed);
                }
            }
        }
    }
}

/// Get city theme based on language
fn get_city_theme(lang: &str) -> &'static str {
    match lang {
        "rs" => "industrial", // Rust = Industrial/Steampunk
        "ts" => "neon",       // TypeScript = Cyberpunk/Neon
        "js" => "retro",      // JavaScript = Retro/Classic
        "py" => "nature",     // Python = Nature/Organic
        "go" => "minimalist", // Go = Clean/Minimalist
        _ => "default",
    }
}

/// Get city name based on language
fn get_city_name(lang: &str) -> &'static str {
    match lang {
        "rs" => "Rustopolis",
        "ts" => "Typescriptia",
        "js" => "Javascriptura",
        "py" => "Pythonia",
        "go" => "Golangton",
        _ => "Unknown Lands",
    }
}

/// The Main Function: Transforms a folder into a WorldSeed
#[instrument(skip(root_path))]
pub fn generate_world(root_path: &Path) -> WorldSeed {
    let mut all_files = Vec::new();
    collect_files(root_path, root_path, &mut all_files);

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
    let complexity_score = calculate_complexity_score(total_buildings, total_rooms, &all_routes);

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
        highways: all_routes,
    }
}

/// Find the main entry point for a language
fn find_entry_point(children: &[GameEntity], lang: &str) -> Option<String> {
    for child in children {
        match child {
            GameEntity::Building { children, .. } | GameEntity::District { children, .. } => {
                if let Some(id) = find_entry_point(children, lang) {
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
    // Simple heuristic:
    // - More buildings = more complex
    // - More rooms = more complex
    // - More interconnections = more complex
    let building_score = (buildings as f32 / 10.0).min(3.0);
    let room_score = (rooms as f32 / 50.0).min(4.0);
    let route_score = (routes.len() as f32 / 100.0).min(3.0);

    (building_score + room_score + route_score)
        .min(10.0)
        .max(1.0)
}

/// Helper: Turns a list of paths + files into a nested District/Building tree
fn reconstruct_hierarchy(files: Vec<ParsedFile>) -> Vec<GameEntity> {
    // Group files by their parent directory
    let mut dir_map: HashMap<String, Vec<GameEntity>> = HashMap::new();

    for file in files {
        // Get the parent directory path
        let path_str = file.path.to_string_lossy();
        let relative_path = path_str.as_ref();

        // Extract parent directory from the file's ID
        if let GameEntity::Building { id, .. } = &file.entity {
            let parts: Vec<&str> = id.split('/').collect();
            if parts.len() > 1 {
                let dir_path = parts[..parts.len() - 1].join("/");
                dir_map.entry(dir_path).or_default().push(file.entity);
            } else {
                // Root level file
                dir_map.entry(String::new()).or_default().push(file.entity);
            }
        }
    }

    // Build district hierarchy
    let mut result = Vec::new();

    for (dir_path, buildings) in dir_map {
        if dir_path.is_empty() {
            // Root level files go directly
            result.extend(buildings);
        } else {
            // Create district for this directory
            let district_name = dir_path.split('/').last().unwrap_or(&dir_path);
            result.push(GameEntity::District {
                id: format!("district_{}", dir_path.replace('/', "_")),
                name: district_name.to_string(),
                path: dir_path,
                children: buildings,
            });
        }
    }

    result
}
