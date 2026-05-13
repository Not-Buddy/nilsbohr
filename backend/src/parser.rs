use crate::git_layer::GitLayer;
use crate::hierarchy;
use crate::languages::registry;
use crate::models::{CityStats, GameEntity, Route, RouteType, WorldMeta, WorldSeed};
use crate::symbol_table::SymbolTable;
use crate::walker;
use rayon::prelude::*;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tracing::{debug, instrument};

pub struct ParsedFile {
    pub language: String,
    pub entity: GameEntity,
    pub loc: u32,
}

#[instrument(skip(path, root_path))]
pub fn parse_single_file(path: &Path, relative_path: &str, root_path: &Path) -> Option<ParsedFile> {
    let ext = path.extension()?.to_str()?;
    let source_code = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return None,
    };

    let loc = source_code.lines().count() as u32;
    let file_id = relative_path.to_string();

    let (children, imports, lang_tag) =
        match registry::parse_by_extension(ext, &source_code, &file_id) {
            Some((entities, imports)) => (entities, imports, normalize_lang_tag(ext)),
            None => return None,
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

    let git_layer = GitLayer::new(root_path);
    let git_metadata = git_layer.get_file_metadata(path);

    let mut file_entity = file_entity;
    if let Some(metadata) = git_metadata
        && let GameEntity::Building { metadata: m, .. } = &mut file_entity
    {
        *m = Some(metadata);
    }

    Some(ParsedFile { language: lang_tag.to_string(), entity: file_entity, loc })
}

pub fn generate_world(root_path: &Path) -> WorldSeed {
    let mut file_paths = Vec::new();
    walker::collect_file_paths(root_path, &mut file_paths);

    let all_files: Vec<ParsedFile> = file_paths
        .par_iter()
        .filter_map(|path| {
            let relative_path = path.strip_prefix(root_path).unwrap_or(path);
            let relative_str = relative_path.to_string_lossy().to_string();
            parse_single_file(path, &relative_str, root_path)
        })
        .collect();

    let mut city_map: HashMap<String, Vec<ParsedFile>> = HashMap::new();
    for file in all_files {
        city_map.entry(file.language.clone()).or_default().push(file);
    }

    let mut cities = Vec::new();
    let mut all_routes = Vec::new();
    let mut route_counter = 0;
    let mut lang_loc: HashMap<String, u32> = HashMap::new();

    for (lang, files) in city_map {
        debug!("Building City for language: {}", lang);

        let total_loc: u32 = files.iter().map(|f| f.loc).sum();
        *lang_loc.entry(lang.clone()).or_default() += total_loc;

        let city_children = hierarchy::reconstruct_hierarchy(files);

        let (buildings, rooms, artifacts, loc) =
            city_children.iter().fold((0, 0, 0, 0), |acc, child| {
                let (b, r, a, l) = child.count_entities();
                (acc.0 + b, acc.1 + r, acc.2 + a, acc.3 + l)
            });

        let entry_point_id = hierarchy::find_entry_point(&city_children, &lang);

        let city = GameEntity::City {
            id: format!("city_{lang}"),
            name: get_city_name(&lang).to_string(),
            language: lang.clone(),
            theme: get_city_theme(&lang).to_string(),
            entry_point_id,
            stats: CityStats { building_count: buildings, room_count: rooms, artifact_count: artifacts, loc },
            children: city_children,
        };

        let call_routes = city.collect_calls();
        for (from, to) in call_routes {
            all_routes.push(Route { id: format!("route_{route_counter}"), from_id: from, to_id: to, route_type: RouteType::FunctionCall, bidirectional: false, metadata: None });
            route_counter += 1;
        }

        let import_routes = city.collect_imports();
        for (from, to) in import_routes {
            all_routes.push(Route { id: format!("route_{route_counter}"), from_id: from, to_id: to, route_type: RouteType::Import, bidirectional: false, metadata: None });
            route_counter += 1;
        }

        cities.push(city);
    }

    debug!("Indexing symbols for resolution...");
    let mut symbol_table = SymbolTable::new();
    symbol_table.index_cities(&cities);

    debug!("Resolving routes...");
    let mut resolved_routes = Vec::new();
    for route in all_routes {
        if let Some(resolved_to) = symbol_table.resolve(&route.to_id, &route.from_id) {
            resolved_routes.push(Route { to_id: resolved_to, ..route });
        }
    }

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

    let complexity_score =
        hierarchy::calculate_complexity_score(total_buildings, total_rooms, &resolved_routes);

    WorldSeed {
        world_meta: WorldMeta {
            total_cities: cities.len() as u32,
            total_buildings, total_rooms, total_artifacts,
            dominant_language, complexity_score,
        },
        cities,
        highways: resolved_routes,
    }
}

fn get_city_theme(lang: &str) -> &'static str {
    match lang {
        "rs" => "industrial",
        "ts" | "tsx" => "neon",
        "js" | "jsx" => "retro",
        "py" => "nature",
        "go" => "minimalist",
        "cpp" | "cc" | "cxx" | "hpp" => "mechanical",
        "c" | "h" => "assembly",
        "java" => "enterprise",
        _ => "default",
    }
}

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

fn normalize_lang_tag(ext: &str) -> String {
    match ext {
        "tsx" => "ts".into(),
        "jsx" => "js".into(),
        "h" | "hpp" => "cpp".into(),
        other => other.into(),
    }
}
