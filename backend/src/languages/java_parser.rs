use crate::models::{GameEntity, Parameter};
use tracing::{debug, instrument, trace};
use tree_sitter::{Node, Parser};

/// Parse Java code (.java) and return (entities, imports)
#[instrument(skip(source))]
pub fn parse_java_code(source: &str, parent_id: &str) -> (Vec<GameEntity>, Vec<String>) {
    let mut parser = Parser::new();

    parser
        .set_language(tree_sitter_java::language())
        .expect("Error loading Java grammar");

    let tree = parser.parse(source, None).unwrap();
    let mut imports = Vec::new();
    let entities = parse_node(tree.root_node(), source.as_bytes(), parent_id, &mut imports);
    (entities, imports)
}

// --- Helpers ---

fn get_text<'a>(node: Node<'a>, source: &'a [u8]) -> String {
    node.utf8_text(source).unwrap_or("").to_string()
}

fn count_lines(node: Node) -> u32 {
    let start = node.start_position().row;
    let end = node.end_position().row;
    (end - start + 1) as u32
}

fn extract_modifiers(node: Node, source: &[u8]) -> (String, bool, bool) {
    // Returns: (visibility, is_static, is_final)
    let mut visibility = "package".to_string();
    let mut is_static = false;
    let mut is_final = false;

    if let Some(modifiers) = node.child_by_field_name("modifiers") {
        let text = get_text(modifiers, source);
        if text.contains("public") {
            visibility = "public".to_string();
        } else if text.contains("private") {
            visibility = "private".to_string();
        } else if text.contains("protected") {
            visibility = "protected".to_string();
        }
        is_static = text.contains("static");
        is_final = text.contains("final");
    }

    (visibility, is_static, is_final)
}

fn extract_parameters(node: Node, source: &[u8]) -> Vec<Parameter> {
    let mut params = Vec::new();
    if let Some(param_list) = node.child_by_field_name("parameters") {
        let mut cursor = param_list.walk();
        for child in param_list.children(&mut cursor) {
            if child.kind() == "formal_parameter" || child.kind() == "spread_parameter" {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_default();
                let datatype = child
                    .child_by_field_name("type")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "Object".to_string());
                if !name.is_empty() {
                    params.push(Parameter { name, datatype });
                }
            }
        }
    }
    params
}

fn extract_return_type(node: Node, source: &[u8]) -> Option<String> {
    node.child_by_field_name("type")
        .map(|n| get_text(n, source))
}

fn extract_function_calls(node: Node, source: &[u8]) -> Vec<String> {
    let mut calls = Vec::new();
    extract_calls_recursive(node, source, &mut calls);
    calls
        .into_iter()
        .filter(|c| !c.is_empty() && !is_builtin(c))
        .collect()
}

fn extract_calls_recursive(node: Node, source: &[u8], calls: &mut Vec<String>) {
    if node.kind() == "method_invocation"
        && let Some(name_node) = node.child_by_field_name("name")
    {
        let name = get_text(name_node, source);
        if !name.is_empty() {
            calls.push(name);
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
            | "printf"
            | "toString"
            | "equals"
            | "hashCode"
            | "getClass"
            | "notify"
            | "notifyAll"
            | "wait"
            | "clone"
            | "finalize"
            | "length"
            | "size"
            | "get"
            | "set"
            | "add"
            | "remove"
            | "contains"
            | "isEmpty"
            | "clear"
            | "iterator"
            | "hasNext"
            | "next"
            | "valueOf"
            | "parseInt"
            | "parseDouble"
            | "parseLong"
            | "format"
    )
}

fn calculate_complexity(node: Node) -> u32 {
    let mut complexity = 1;
    count_complexity_nodes(node, &mut complexity);
    complexity
}

fn count_complexity_nodes(node: Node, complexity: &mut u32) {
    match node.kind() {
        "if_statement"
        | "else"
        | "for_statement"
        | "enhanced_for_statement"
        | "while_statement"
        | "do_statement"
        | "switch_expression"
        | "switch_block_statement_group"
        | "catch_clause"
        | "ternary_expression"
        | "lambda_expression" => {
            *complexity += 1;
        }
        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        count_complexity_nodes(child, complexity);
    }
}

// --- Recursive Parser ---

#[instrument(skip(node, source, imports), level = "trace")]
fn parse_node(
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
            // --- PACKAGE DECLARATION ---
            "package_declaration" => {
                // We can extract package info if needed
            }

            // --- IMPORTS ---
            "import_declaration" => {
                let mut import_cursor = child.walk();
                for import_child in child.children(&mut import_cursor) {
                    if import_child.kind() == "scoped_identifier" {
                        let import_path = get_text(import_child, source);
                        if !import_path.is_empty() {
                            imports.push(format!("{}.java", import_path.replace('.', "/")));
                        }
                    }
                }
            }

            // --- CLASSES (Buildings) ---
            "class_declaration" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "AnonymousClass".into());

                let id = format!("{}::{}", parent_id, name);
                let loc = count_lines(child);
                let (visibility, _is_static, _is_final) = extract_modifiers(child, source);

                let children = if let Some(body) = child.child_by_field_name("body") {
                    parse_node(body, source, &id, imports)
                } else {
                    vec![]
                };

                debug!(name = %name, kind = "Building", "Found class");
                entities.push(GameEntity::Building {
                    id,
                    name,
                    building_type: "class".to_string(),
                    is_public: visibility == "public",
                    loc,
                    imports: vec![],
                    children,
                    metadata: None,
                });
            }

            // --- INTERFACES (Buildings) ---
            "interface_declaration" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "AnonymousInterface".into());

                let id = format!("{}::{}", parent_id, name);
                let loc = count_lines(child);
                let (visibility, _, _) = extract_modifiers(child, source);

                let children = if let Some(body) = child.child_by_field_name("body") {
                    parse_node(body, source, &id, imports)
                } else {
                    vec![]
                };

                debug!(name = %name, kind = "Building", "Found interface");
                entities.push(GameEntity::Building {
                    id,
                    name,
                    building_type: "interface".to_string(),
                    is_public: visibility == "public",
                    loc,
                    imports: vec![],
                    children,
                    metadata: None,
                });
            }

            // --- ENUMS (Buildings) ---
            "enum_declaration" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "AnonymousEnum".into());

                let id = format!("{}::{}", parent_id, name);
                let loc = count_lines(child);
                let (visibility, _, _) = extract_modifiers(child, source);

                let children = if let Some(body) = child.child_by_field_name("body") {
                    parse_node(body, source, &id, imports)
                } else {
                    vec![]
                };

                debug!(name = %name, kind = "Building", "Found enum");
                entities.push(GameEntity::Building {
                    id,
                    name,
                    building_type: "enum".to_string(),
                    is_public: visibility == "public",
                    loc,
                    imports: vec![],
                    children,
                    metadata: None,
                });
            }

            // --- METHODS (Rooms) ---
            "method_declaration" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "method".into());

                let id = format!("{}::{}", parent_id, name);
                let loc = count_lines(child);
                let (visibility, is_static, _) = extract_modifiers(child, source);
                let parameters = extract_parameters(child, source);
                let return_type = extract_return_type(child, source);
                let complexity = calculate_complexity(child);

                let is_main = name == "main" && is_static;

                let calls = if let Some(body) = child.child_by_field_name("body") {
                    extract_function_calls(body, source)
                } else {
                    vec![]
                };

                let children = if let Some(body) = child.child_by_field_name("body") {
                    parse_node(body, source, &id, imports)
                } else {
                    vec![]
                };

                debug!(name = %name, kind = "Room", "Found method");
                entities.push(GameEntity::Room {
                    id,
                    name,
                    room_type: if is_static { "static_method" } else { "method" }.to_string(),
                    is_main,
                    is_async: false,
                    visibility,
                    complexity,
                    loc,
                    parameters,
                    return_type,
                    calls,
                    children,
                    metadata: None,
                });
            }

            // --- CONSTRUCTORS (Rooms) ---
            "constructor_declaration" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "constructor".into());

                let id = format!("{}::{}", parent_id, name);
                let loc = count_lines(child);
                let (visibility, _, _) = extract_modifiers(child, source);
                let parameters = extract_parameters(child, source);
                let complexity = calculate_complexity(child);

                let calls = if let Some(body) = child.child_by_field_name("body") {
                    extract_function_calls(body, source)
                } else {
                    vec![]
                };

                let children = if let Some(body) = child.child_by_field_name("body") {
                    parse_node(body, source, &id, imports)
                } else {
                    vec![]
                };

                entities.push(GameEntity::Room {
                    id,
                    name,
                    room_type: "constructor".to_string(),
                    is_main: false,
                    is_async: false,
                    visibility,
                    complexity,
                    loc,
                    parameters,
                    return_type: None,
                    calls,
                    children,
                    metadata: None,
                });
            }

            // --- FIELDS (Artifacts) ---
            "field_declaration" => {
                let (_visibility, _is_static, is_final) = extract_modifiers(child, source);

                let datatype = child
                    .child_by_field_name("type")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "Object".to_string());

                let mut field_cursor = child.walk();
                for field_child in child.children(&mut field_cursor) {
                    if field_child.kind() == "variable_declarator" {
                        let name = field_child
                            .child_by_field_name("name")
                            .map(|n| get_text(n, source))
                            .unwrap_or_default();

                        if !name.is_empty() {
                            let id = format!("{}::{}", parent_id, name);

                            let value_hint = field_child.child_by_field_name("value").map(|v| {
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

                            trace!(name = %name, kind = "Artifact", "Found field");
                            entities.push(GameEntity::Artifact {
                                id,
                                name,
                                artifact_type: if is_final { "constant" } else { "field" }
                                    .to_string(),
                                datatype: datatype.clone(),
                                is_mutable: !is_final,
                                value_hint,
                                metadata: None,
                            });
                        }
                    }
                }
            }

            // --- ENUM CONSTANTS ---
            "enum_constant" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_default();

                if !name.is_empty() {
                    let id = format!("{}::{}", parent_id, name);
                    entities.push(GameEntity::Artifact {
                        id,
                        name,
                        artifact_type: "enum_value".to_string(),
                        datatype: "enum".to_string(),
                        is_mutable: false,
                        value_hint: None,
                        metadata: None,
                    });
                }
            }

            // --- RECURSION FALLBACK ---
            _ => {
                if child.child_count() > 0 {
                    entities.extend(parse_node(child, source, parent_id, imports));
                }
            }
        }
    }
    entities
}
