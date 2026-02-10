use crate::models::{GameEntity, Parameter};
use tracing::{debug, instrument, trace};
use tree_sitter::{Node, Parser};

/// Parse TypeScript code (.ts, .tsx) and return (entities, imports)
pub fn parse_typescript_code(
    source: &str,
    parent_id: &str,
) -> (Vec<GameEntity>, Vec<String>) {
    let mut parser = Parser::new();
    
    parser
        .set_language(tree_sitter_typescript::language_typescript())
        .expect("Error loading TypeScript grammar");

    let tree = parser.parse(source, None).unwrap();
    let mut imports = Vec::new();
    let entities = parse_node(tree.root_node(), source.as_bytes(), parent_id, &mut imports);
    (entities, imports)
}

// --- Helpers ---

fn get_text<'a>(node: Node<'a>, source: &'a [u8]) -> String {
    node.utf8_text(source).unwrap_or("").to_string()
}

fn is_exported(node: Node, _source: &[u8]) -> bool {

    if let Some(parent) = node.parent() {
        if parent.kind() == "export_statement" {
            return true;
        }
    }
    node.children(&mut node.walk())
        .any(|c| c.kind() == "export")
}

fn is_async(node: Node, source: &[u8]) -> bool {
    get_text(node, source).trim().starts_with("async")
        || node.children(&mut node.walk()).any(|c| c.kind() == "async")
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
            let kind = child.kind();
            if kind == "required_parameter" || kind == "optional_parameter" || kind == "identifier" {
                let name = if kind == "identifier" {
                    get_text(child, source)
                } else {
                    child.child_by_field_name("pattern")
                        .map(|n| get_text(n, source))
                        .unwrap_or_default()
                };

                let datatype = child
                    .child_by_field_name("type")
                    .map(|t| get_text(t, source).trim_start_matches(": ").to_string())
                    .unwrap_or_else(|| "any".to_string());

                if !name.is_empty() && name != "(" && name != ")" && name != "," {
                    params.push(Parameter { name, datatype });
                }
            }
        }
    }
    params
}

fn extract_return_type(node: Node, source: &[u8]) -> Option<String> {
    node.child_by_field_name("return_type")
        .map(|n| get_text(n, source).trim_start_matches(": ").to_string())
}

fn extract_function_calls(node: Node, source: &[u8]) -> Vec<String> {
    let mut calls = Vec::new();
    extract_calls_recursive(node, source, &mut calls);
    calls.into_iter()
        .filter(|c| !c.is_empty() && !is_builtin(c))
        .collect()
}

fn extract_calls_recursive(node: Node, source: &[u8], calls: &mut Vec<String>) {
    if node.kind() == "call_expression" {
        if let Some(func_node) = node.child_by_field_name("function") {
            let func_name = get_text(func_node, source);
            let clean_name = func_name.split('.').last().unwrap_or(&func_name).to_string();
            if !clean_name.is_empty() {
                calls.push(clean_name);
            }
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
        "console" | "log" | "error" | "warn" | "map" | "filter" | "reduce" | "forEach"
            | "push" | "pop" | "shift" | "unshift" | "slice" | "splice" | "JSON" | "parse"
            | "stringify" | "parseInt" | "parseFloat" | "toString" | "then" | "catch"
            | "finally" | "Promise" | "async" | "await"
    )
}

fn calculate_complexity(node: Node) -> u32 {
    let mut complexity = 1;
    count_complexity_nodes(node, &mut complexity);
    complexity
}

fn count_complexity_nodes(node: Node, complexity: &mut u32) {
    match node.kind() {
        "if_statement" | "switch_statement" | "while_statement" | "for_statement"
        | "for_in_statement" | "for_of_statement" | "catch_clause" | "ternary_expression"
        | "optional_chain_expression" => {
            *complexity += 1;
        }
        "switch_case" => {
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
            // --- IMPORTS ---
            "import_statement" => {
                if let Some(source_node) = child.child_by_field_name("source") {
                    let import_path = get_text(source_node, source)
                        .trim_matches(|c| c == '"' || c == '\'' || c == '`')
                        .to_string();
                    if import_path.starts_with("./") || import_path.starts_with("../") {
                        imports.push(format!("{}.ts", import_path)); // Assume TS for now
                    }
                }
            }

            // --- BUILDINGS (Classes, Interfaces, Enums, Types) ---
            
            "class_declaration" | "abstract_class_declaration" => {
                let name = child.child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "AnonymousClass".into());

                let id = format!("{}::{}", parent_id, name);
                let is_public = is_exported(child, source);
                let loc = count_lines(child);
                let children = parse_node(child, source, &id, imports);

                debug!(name = %name, kind = "Building", "Found class");
                entities.push(GameEntity::Building {
                    id,
                    name,
                    building_type: "class".to_string(),
                    is_public,
                    loc,
                    imports: vec![],
                    children,
                });
            }

            "interface_declaration" => {
                let name = child.child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "AnonymousInterface".into());

                let id = format!("{}::{}", parent_id, name);
                let is_public = is_exported(child, source);
                let loc = count_lines(child);
                let children = parse_node(child, source, &id, imports);

                entities.push(GameEntity::Building {
                    id,
                    name,
                    building_type: "interface".to_string(),
                    is_public,
                    loc,
                    imports: vec![],
                    children,
                });
            }

            "enum_declaration" => {
                let name = child.child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "AnonymousEnum".into());

                let id = format!("{}::{}", parent_id, name);
                let is_public = is_exported(child, source);
                let loc = count_lines(child);
                
                // Enums in TS often contain values, we can parse them as children artifacts
                let children = parse_node(child, source, &id, imports);

                entities.push(GameEntity::Building {
                    id,
                    name,
                    building_type: "enum".to_string(),
                    is_public,
                    loc,
                    imports: vec![],
                    children,
                });
            }

            "type_alias_declaration" => {
                let name = child.child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "AnonymousType".into());

                let id = format!("{}::{}", parent_id, name);
                let is_public = is_exported(child, source);
                let loc = count_lines(child);

                entities.push(GameEntity::Building {
                    id,
                    name,
                    building_type: "type_alias".to_string(),
                    is_public,
                    loc,
                    imports: vec![],
                    children: vec![], // Types usually don't have "children" in the game sense
                });
            }

            // --- ROOMS (Functions, Methods) ---
            
            "function_declaration" | "generator_function_declaration" => {
                let name = child.child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "fn".into());

                let id = format!("{}::{}", parent_id, name);
                let loc = count_lines(child);
                let is_async_fn = is_async(child, source);
                let parameters = extract_parameters(child, source);
                let return_type = extract_return_type(child, source);
                let visibility = if is_exported(child, source) { "public" } else { "private" };
                let complexity = calculate_complexity(child);

                let calls = if let Some(body) = child.child_by_field_name("body") {
                    extract_function_calls(body, source)
                } else {
                    vec![]
                };

                let children = parse_function_body(child, source, &id, imports);

                debug!(name = %name, kind = "Room", "Found function");
                entities.push(GameEntity::Room {
                    id,
                    name,
                    room_type: "function".to_string(),
                    is_main: false,
                    is_async: is_async_fn,
                    visibility: visibility.to_string(),
                    complexity,
                    loc,
                    parameters,
                    return_type,
                    calls,
                    children,
                });
            }

            "method_definition" => {
                let name = child.child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "method".into());

                let id = format!("{}::{}", parent_id, name);
                let loc = count_lines(child);
                let is_async_fn = is_async(child, source);
                let parameters = extract_parameters(child, source);
                let return_type = extract_return_type(child, source);
                let complexity = calculate_complexity(child);

                let calls = if let Some(body) = child.child_by_field_name("body") {
                    extract_function_calls(body, source)
                } else {
                    vec![]
                };

                let children = parse_function_body(child, source, &id, imports);

                entities.push(GameEntity::Room {
                    id,
                    name,
                    room_type: "method".to_string(),
                    is_main: false,
                    is_async: is_async_fn,
                    visibility: "public".to_string(),
                    complexity,
                    loc,
                    parameters,
                    return_type,
                    calls,
                    children,
                });
            }

            // --- ARTIFACTS (Variables, Arrow Functions, Enum Members) ---
            
            "lexical_declaration" | "variable_declaration" => {
                let mut decl_cursor = child.walk();
                for decl in child.children(&mut decl_cursor) {
                    if decl.kind() == "variable_declarator" {
                        let name = decl.child_by_field_name("name")
                            .map(|n| get_text(n, source))
                            .unwrap_or_else(|| "var".into());

                        let value_node = decl.child_by_field_name("value");
                        let id = format!("{}::{}", parent_id, name);

                        // Check if the value is an Arrow Function
                        if let Some(val) = value_node {
                            if val.kind() == "arrow_function" {
                                let loc = count_lines(val);
                                let is_async_fn = is_async(val, source);
                                let parameters = extract_parameters(val, source);
                                let return_type = extract_return_type(val, source);
                                let complexity = calculate_complexity(val);
                                let calls = extract_function_calls(val, source);
                                let children = parse_function_body(val, source, &id, imports);

                                debug!(name = %name, kind = "Room", "Found arrow function");
                                entities.push(GameEntity::Room {
                                    id,
                                    name,
                                    room_type: "arrow_function".to_string(),
                                    is_main: false,
                                    is_async: is_async_fn,
                                    visibility: if is_exported(child, source) { "public" } else { "private" }.to_string(),
                                    complexity,
                                    loc,
                                    parameters,
                                    return_type,
                                    calls,
                                    children,
                                });
                                continue;
                            }
                        }

                        // Otherwise it's a variable/constant
                        let artifact_type = if get_text(child, source).starts_with("const") { "constant" } else { "variable" };
                        
                        let datatype = decl.child_by_field_name("type")
                            .map(|t| get_text(t, source).trim_start_matches(": ").to_string())
                            .unwrap_or_else(|| "any".to_string());

                        let value_hint = value_node.map(|v| {
                            let val = get_text(v, source);
                            if val.len() > 30 { 
                                let truncated = val.chars().take(27).collect::<String>();
                                format!("{}...", truncated) 
                            } else { val }
                        });

                        trace!(name = %name, kind = "Artifact", "Found variable");
                        entities.push(GameEntity::Artifact {
                            id,
                            name,
                            artifact_type: artifact_type.to_string(),
                            datatype,
                            is_mutable: !get_text(child, source).starts_with("const"),
                            value_hint,
                        });
                    }
                }
            }

            "public_field_definition" | "field_definition" => {
                let name = child.child_by_field_name("property")
                    .or_else(|| child.child_by_field_name("name"))
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "field".into());

                let id = format!("{}::{}", parent_id, name);
                let datatype = child.child_by_field_name("type")
                    .map(|t| get_text(t, source).trim_start_matches(": ").to_string())
                    .unwrap_or_else(|| "any".to_string());

                entities.push(GameEntity::Artifact {
                    id,
                    name,
                    artifact_type: "field".to_string(),
                    datatype,
                    is_mutable: true,
                    value_hint: None,
                });
            }
            
            "enum_member" => {
                 let name = child.child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "member".into());
                
                 let id = format!("{}::{}", parent_id, name);
                 
                 entities.push(GameEntity::Artifact {
                    id,
                    name,
                    artifact_type: "enum_value".to_string(),
                    datatype: "enum".to_string(),
                    is_mutable: false,
                    value_hint: None,
                });
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

fn parse_function_body(
    node: Node,
    source: &[u8],
    parent_id: &str,
    imports: &mut Vec<String>,
) -> Vec<GameEntity> {
    let mut contents = Vec::new();

    if let Some(body) = node.child_by_field_name("body") {
        contents.extend(parse_node(body, source, parent_id, imports));
    }

    contents
}