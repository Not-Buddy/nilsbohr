use crate::models::{GameEntity, Parameter};
use tracing::instrument;
use tree_sitter::{Node, Parser};

/// Parse Rust code and return (entities, imports)
pub fn parse_rust_code(source: &str, parent_id: &str) -> (Vec<GameEntity>, Vec<String>) {
    let mut parser = Parser::new();
    parser
        .set_language(tree_sitter_rust::language())
        .expect("Error loading Rust grammar");

    let tree = parser.parse(source, None).unwrap();
    let mut imports = Vec::new();
    let entities = parse_rust_node(tree.root_node(), source.as_bytes(), parent_id, &mut imports);
    (entities, imports)
}

fn get_text<'a>(node: Node<'a>, source: &'a [u8]) -> String {
    node.utf8_text(source).unwrap_or("").to_string()
}

fn is_public(node: Node, source: &[u8]) -> bool {
    node.children(&mut node.walk()).any(|child| {
        child.kind() == "visibility_modifier" && get_text(child, source).starts_with("pub")
    })
}

fn is_async(node: Node, source: &[u8]) -> bool {
    node.children(&mut node.walk())
        .any(|child| child.kind() == "async")
        || get_text(node, source).contains("async fn")
}

fn count_lines(node: Node) -> u32 {
    let start = node.start_position().row;
    let end = node.end_position().row;
    (end - start + 1) as u32
}

fn extract_parameters(node: Node, source: &[u8]) -> Vec<Parameter> {
    let mut params = Vec::new();
    if let Some(param_list) = node.child_by_field_name("parameters") {
        let mut cursor = param_list.walk();
        for child in param_list.children(&mut cursor) {
            if child.kind() == "parameter" {
                let name = child
                    .child_by_field_name("pattern")
                    .map(|n| get_text(n, source))
                    .unwrap_or_default();
                let datatype = child
                    .child_by_field_name("type")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "inferred".to_string());
                if !name.is_empty() && name != "self" && name != "&self" && name != "&mut self" {
                    params.push(Parameter { name, datatype });
                }
            }
        }
    }
    params
}

fn extract_return_type(node: Node, source: &[u8]) -> Option<String> {
    node.child_by_field_name("return_type")
        .map(|n| get_text(n, source).trim_start_matches("-> ").to_string())
}

fn extract_function_calls(node: Node, source: &[u8], _parent_id: &str) -> Vec<String> {
    let mut calls = Vec::new();
    extract_calls_recursive(node, source, &mut calls);
    // Convert simple function names to potential IDs
    calls
        .into_iter()
        .filter(|c| !c.is_empty() && !is_builtin(c))
        .collect()
}

fn extract_calls_recursive(node: Node, source: &[u8], calls: &mut Vec<String>) {
    if node.kind() == "call_expression"
        && let Some(func_node) = node.child_by_field_name("function")
    {
        let func_name = get_text(func_node, source);
        // Clean up the function name
        let clean_name = func_name
            .split("::")
            .last()
            .unwrap_or(&func_name)
            .split('.')
            .next_back()
            .unwrap_or(&func_name)
            .to_string();
        if !clean_name.is_empty() {
            calls.push(clean_name);
        }
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        extract_calls_recursive(child, source, calls);
    }
}

fn is_builtin(name: &str) -> bool {
    matches!(
        name,
        "println"
            | "print"
            | "format"
            | "vec"
            | "Some"
            | "None"
            | "Ok"
            | "Err"
            | "unwrap"
            | "expect"
            | "clone"
            | "to_string"
            | "into"
            | "from"
            | "new"
            | "default"
    )
}

#[instrument(skip(node, source, imports), level = "trace")]
fn parse_rust_node(
    node: Node,
    source: &[u8],
    parent_id: &str,
    imports: &mut Vec<String>,
) -> Vec<GameEntity> {
    let mut entities = Vec::new();
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        let kind = child.kind();

        match kind {
            // --- IMPORTS ---
            "use_declaration" => {
                let import_path = get_text(child, source)
                    .trim_start_matches("use ")
                    .trim_end_matches(';')
                    .to_string();
                // Convert crate imports to potential file paths
                if import_path.starts_with("crate::") {
                    let path = import_path.replace("crate::", "src/").replace("::", "/");
                    imports.push(format!("{}.rs", path));
                }
            }

            // --- BUILDINGS (Structs, Enums, Traits) ---
            "struct_item" | "enum_item" | "trait_item" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "Anonymous".into());

                let id = format!("{}::{}", parent_id, name);
                let children = parse_rust_node(child, source, &id, imports);
                let loc = count_lines(child);

                entities.push(GameEntity::Building {
                    id,
                    name,
                    building_type: kind.replace("_item", ""),
                    is_public: is_public(child, source),
                    loc,
                    imports: vec![],
                    children,
                    metadata: None,
                });
            }

            // --- IMPL BLOCKS (treated as Buildings) ---
            "impl_item" => {
                // Handle both inherent impls (impl Type) and trait impls (impl Trait for Type)
                let trait_node = child.child_by_field_name("trait");
                let self_type_node = child.child_by_field_name("type");

                let name = if let Some(trait_node) = trait_node {
                    // This is a trait implementation: impl Trait for Type
                    let trait_name = get_text(trait_node, source);
                    let self_type_name = self_type_node
                        .map(|n| get_text(n, source))
                        .unwrap_or_else(|| "unknown".into());
                    format!("impl {} for {}", trait_name, self_type_name)
                } else if let Some(self_type_node) = self_type_node {
                    // This is an inherent implementation: impl Type
                    let self_type_name = get_text(self_type_node, source);
                    format!("impl {}", self_type_name)
                } else {
                    // Fallback if we can't determine the type
                    "impl unknown".to_string()
                };

                let id = format!(
                    "{}::{}",
                    parent_id,
                    name.replace(' ', "_").replace(['<', '>', ':'], "_")
                );
                let children = parse_rust_node(child, source, &id, imports);
                let loc = count_lines(child);

                entities.push(GameEntity::Building {
                    id,
                    name,
                    building_type: "impl".to_string(),
                    is_public: false, // Impls are not directly public/private like other items
                    loc,
                    imports: vec![],
                    children,
                    metadata: None,
                });
            }

            // --- ROOMS (Functions) ---
            "function_item" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "fn".into());

                let id = format!("{}::{}", parent_id, name);
                let is_main = name == "main";
                let loc = count_lines(child);
                let parameters = extract_parameters(child, source);
                let return_type = extract_return_type(child, source);
                let is_async_fn = is_async(child, source);
                let visibility = if is_public(child, source) {
                    "public"
                } else {
                    "private"
                };

                // Get function calls from body
                let calls = if let Some(body) = child.child_by_field_name("body") {
                    extract_function_calls(body, source, &id)
                } else {
                    vec![]
                };

                // Recurse for inner items
                let mut contents = Vec::new();
                if let Some(body) = child.child_by_field_name("body") {
                    contents.extend(parse_rust_node(body, source, &id, imports));
                }

                // Calculate complexity based on control flow
                let complexity = calculate_complexity(child, source);

                entities.push(GameEntity::Room {
                    id,
                    name,
                    room_type: "function".to_string(),
                    is_main,
                    is_async: is_async_fn,
                    visibility: visibility.to_string(),
                    complexity,
                    loc,
                    parameters,
                    return_type,
                    calls,
                    children: contents,
                    metadata: None,
                });
            }

            // --- ARTIFACTS (Variables) ---
            "let_declaration" | "const_item" | "static_item" => {
                let name_node = child
                    .child_by_field_name("pattern")
                    .or_else(|| child.child_by_field_name("name"));

                let type_node = child.child_by_field_name("type");
                let value_node = child.child_by_field_name("value");

                if let Some(n) = name_node {
                    let name = get_text(n, source);
                    let datatype = type_node
                        .map(|t| get_text(t, source))
                        .unwrap_or_else(|| "inferred".into());
                    let id = format!("{}::{}", parent_id, name);
                    let text = get_text(child, source);
                    let is_mutable = text.contains("mut");

                    let artifact_type = match kind {
                        "const_item" => "constant",
                        "static_item" => "static",
                        _ => "variable",
                    };

                    // Get abbreviated value hint
                    let value_hint = value_node.map(|v| {
                        let val = get_text(v, source);
                        if val.len() > 30 {
                            {
                                let truncated = val.chars().take(27).collect::<String>();
                                format!("{}...", truncated)
                            }
                        } else {
                            val
                        }
                    });

                    entities.push(GameEntity::Artifact {
                        id,
                        name,
                        artifact_type: artifact_type.to_string(),
                        datatype,
                        is_mutable,
                        value_hint,
                        metadata: None,
                    });
                }
            }

            // --- FIELD DECLARATIONS (inside structs) ---
            "field_declaration" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_default();
                let datatype = child
                    .child_by_field_name("type")
                    .map(|t| get_text(t, source))
                    .unwrap_or_else(|| "unknown".into());

                if !name.is_empty() {
                    let id = format!("{}::{}", parent_id, name);
                    entities.push(GameEntity::Artifact {
                        id,
                        name,
                        artifact_type: "field".to_string(),
                        datatype,
                        is_mutable: false,
                        value_hint: None,
                        metadata: None,
                    });
                }
            }

            _ => {
                if child.child_count() > 0 {
                    entities.extend(parse_rust_node(child, source, parent_id, imports));
                }
            }
        }
    }
    entities
}

/// Calculate cyclomatic complexity based on control flow nodes
fn calculate_complexity(node: Node, _source: &[u8]) -> u32 {
    let mut complexity = 1; // Base complexity
    count_complexity_nodes(node, &mut complexity);
    complexity
}

fn count_complexity_nodes(node: Node, complexity: &mut u32) {
    match node.kind() {
        "if_expression" | "match_expression" | "while_expression" | "for_expression"
        | "loop_expression" | "?" => {
            *complexity += 1;
        }
        "match_arm" => {
            *complexity += 1;
        }
        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        count_complexity_nodes(child, complexity);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_impl_blocks() {
        let source_code = r#"
        struct Person {
            name: String,
            age: u32,
        }

        // Inherent implementation
        impl Person {
            fn new(name: String, age: u32) -> Self {
                Person { name, age }
            }
            
            fn get_name(&self) -> &str {
                &self.name
            }
        }

        trait Greet {
            fn greet(&self) -> String;
        }

        // Trait implementation
        impl Greet for Person {
            fn greet(&self) -> String {
                format!("Hello, my name is {}", self.name)
            }
        }
        "#;

        let (entities, _imports) = parse_rust_code(source_code, "test_file");

        // Look for impl blocks in the parsed entities
        let impl_blocks: Vec<_> = entities
            .iter()
            .filter(|entity| {
                if let GameEntity::Building { building_type, .. } = entity {
                    building_type == "impl"
                } else {
                    false
                }
            })
            .collect();

        assert_eq!(impl_blocks.len(), 2, "Should find 2 impl blocks");

        // Check that we have both an inherent impl and a trait impl
        let mut has_inherent_impl = false;
        let mut has_trait_impl = false;

        for entity in impl_blocks {
            if let GameEntity::Building { name, .. } = entity {
                if name.contains("impl Person") && !name.contains("for") {
                    has_inherent_impl = true;
                } else if name.contains("impl Greet for Person") {
                    has_trait_impl = true;
                }
            }
        }

        assert!(has_inherent_impl, "Should have an inherent impl block");
        assert!(has_trait_impl, "Should have a trait impl block");
    }
}
