use crate::models::GameEntity;
use std::collections::HashMap;

/// Global symbol table to resolve function calls and imports
pub struct SymbolTable {
    /// Map of "symbol_name" -> "entity_id" (Exact match)
    symbols: HashMap<String, String>,

    /// Map of "short_name" -> List of "entity_id" (Fuzzy / Short name match)
    index: HashMap<String, Vec<String>>,
}

impl SymbolTable {
    pub fn new() -> Self {
        Self {
            symbols: HashMap::new(),
            index: HashMap::new(),
        }
    }

    /// Index all entities in a list of cities
    pub fn index_cities(&mut self, cities: &[GameEntity]) {
        for city in cities {
            self.index_entity(city);
        }
    }

    fn index_entity(&mut self, entity: &GameEntity) {
        match entity {
            GameEntity::Room {
                id, name, children, ..
            }
            | GameEntity::Building {
                id, name, children, ..
            } => {
                // 1. Index full ID
                self.symbols.insert(id.clone(), id.clone());

                // 2. Index short name (e.g. "my_function")
                self.index.entry(name.clone()).or_default().push(id.clone());

                // 3. Index "FileName::SymbolName" for semi-qualified lookup
                // ID format is usually "path/to/file::Symbol"
                if let Some(parent_path) = id.rsplit("::").nth(1) {
                    // e.g. parent_path = "src/utils.rs" -> file_name = "utils.rs"
                    if let Some(file_name) = parent_path.split('/').last() {
                        let qualified = format!("{}::{}", file_name, name);
                        self.symbols.insert(qualified, id.clone());
                    }
                }

                for child in children {
                    self.index_entity(child);
                }
            }
            GameEntity::District { children, .. } | GameEntity::City { children, .. } => {
                for child in children {
                    self.index_entity(child);
                }
            }
            _ => {}
        }
    }

    /// Resolve a potential function call or import to a definitive ID
    pub fn resolve(&self, symbol: &str, context_file_id: &str) -> Option<String> {
        // 1. Exact match
        if let Some(id) = self.symbols.get(symbol) {
            return Some(id.clone());
        }

        // 2. Resolve relative to current file (same module)
        // e.g. calling "helper" inside "src/main.rs" -> check "src/main.rs::helper"
        let local_id = format!("{}::{}", context_file_id, symbol);
        if let Some(id) = self.symbols.get(&local_id) {
            return Some(id.clone());
        }

        // 3. Resolve via short name index
        if let Some(candidates) = self.index.get(symbol) {
            // Disambiguation strategy:
            // - If only 1 candidate, use it.
            // - If context file ID shares prefix (same dir), prefer that.

            if candidates.len() == 1 {
                return Some(candidates[0].clone());
            }

            // Simple proximity heuristic: longest common prefix with context
            let best_match = candidates
                .iter()
                .max_by_key(|cand_id| common_prefix_len(cand_id, context_file_id));

            if let Some(best) = best_match {
                return Some(best.clone());
            }
        }

        None
    }
}

fn common_prefix_len(a: &str, b: &str) -> usize {
    a.char_indices()
        .zip(b.chars())
        .take_while(|((_, c1), c2)| c1 == c2)
        .count()
}
