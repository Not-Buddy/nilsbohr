use crate::models::{GameEntity, Parameter};
use tracing::{debug, instrument, trace};
use tree_sitter::{Node, Parser};

/// Parse C++ code (.cpp, .cc, .cxx, .hpp, .h) and return (entities, imports)
#[instrument(skip(source))]
pub fn parse_cpp_code(source: &str, parent_id: &str) -> (Vec<GameEntity>, Vec<String>) {
    let mut parser = Parser::new();

    parser
        .set_language(tree_sitter_cpp::language())
        .expect("Error loading C++ grammar");

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

fn extract_parameters(node: Node, source: &[u8]) -> Vec<Parameter> {
    let mut params = Vec::new();
    if let Some(param_list) = node.child_by_field_name("parameters") {
        let mut cursor = param_list.walk();
        for child in param_list.children(&mut cursor) {
            if child.kind() == "parameter_declaration" {
                let name = child
                    .child_by_field_name("declarator")
                    .map(|n| get_text(n, source))
                    .unwrap_or_default();
                let datatype = child
                    .child_by_field_name("type")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "auto".to_string());
                if !name.is_empty() {
                    params.push(Parameter { name, datatype });
                }
            } else if child.kind() == "optional_parameter_declaration" {
                let name = child
                    .child_by_field_name("declarator")
                    .map(|n| get_text(n, source))
                    .unwrap_or_default();
                let datatype = child
                    .child_by_field_name("type")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "auto".to_string());
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
    if node.kind() == "call_expression" {
        if let Some(func_node) = node.child_by_field_name("function") {
            let func_name = get_text(func_node, source);
            // Get the last part of a qualified name (e.g., "std::cout" -> "cout")
            let clean_name = func_name
                .split("::")
                .last()
                .unwrap_or(&func_name)
                .split('.')
                .last()
                .unwrap_or(&func_name)
                .to_string();
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
        "cout"
            | "cin"
            | "cerr"
            | "endl"
            | "printf"
            | "scanf"
            | "malloc"
            | "free"
            | "new"
            | "delete"
            | "sizeof"
            | "typeid"
            | "static_cast"
            | "dynamic_cast"
            | "const_cast"
            | "reinterpret_cast"
            | "move"
            | "forward"
            | "make_unique"
            | "make_shared"
            | "push_back"
            | "emplace_back"
            | "begin"
            | "end"
            | "size"
            | "empty"
            | "find"
            | "insert"
            | "erase"
            | "clear"
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
        | "else_clause"
        | "for_statement"
        | "for_range_loop"
        | "while_statement"
        | "do_statement"
        | "switch_statement"
        | "case_statement"
        | "catch_clause"
        | "conditional_expression" => {
            *complexity += 1;
        }
        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        count_complexity_nodes(child, complexity);
    }
}

fn get_access_specifier(node: Node, source: &[u8]) -> &'static str {
    // Walk up to find access specifier
    if let Some(parent) = node.parent() {
        let mut cursor = parent.walk();
        let mut last_access = "private"; // C++ default for class
        for child in parent.children(&mut cursor) {
            if child.kind() == "access_specifier" {
                let spec = get_text(child, source).trim_end_matches(':').to_lowercase();
                last_access = match spec.as_str() {
                    "public" => "public",
                    "protected" => "protected",
                    _ => "private",
                };
            }
            if child.id() == node.id() {
                return last_access;
            }
        }
    }
    "private"
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
            // --- INCLUDES ---
            "preproc_include" => {
                if let Some(path_node) = child.child_by_field_name("path") {
                    let path = get_text(path_node, source)
                        .trim_matches(|c| c == '"' || c == '<' || c == '>')
                        .to_string();
                    if !path.is_empty() {
                        imports.push(path);
                    }
                }
            }

            // --- NAMESPACES (Districts) ---
            "namespace_definition" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "anonymous".into());

                let id = format!("{}::{}", parent_id, name);

                let children = if let Some(body) = child.child_by_field_name("body") {
                    parse_node(body, source, &id, imports)
                } else {
                    vec![]
                };

                debug!(name = %name, kind = "District", "Found namespace");
                entities.push(GameEntity::District {
                    id,
                    name,
                    path: parent_id.to_string(),
                    children,
                });
            }

            // --- CLASSES/STRUCTS (Buildings) ---
            "class_specifier" | "struct_specifier" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "AnonymousClass".into());

                let id = format!("{}::{}", parent_id, name);
                let loc = count_lines(child);
                let building_type = if kind == "struct_specifier" {
                    "struct"
                } else {
                    "class"
                };

                let children = if let Some(body) = child.child_by_field_name("body") {
                    parse_node(body, source, &id, imports)
                } else {
                    vec![]
                };

                debug!(name = %name, kind = "Building", "Found class/struct");
                entities.push(GameEntity::Building {
                    id,
                    name,
                    building_type: building_type.to_string(),
                    is_public: true,
                    loc,
                    imports: vec![],
                    children,
                });
            }

            // --- FUNCTIONS (Rooms) ---
            "function_definition" => {
                let declarator = child.child_by_field_name("declarator");
                let name = declarator
                    .and_then(|d| d.child_by_field_name("declarator"))
                    .map(|n| get_text(n, source))
                    .or_else(|| declarator.map(|d| get_text(d, source)))
                    .unwrap_or_else(|| "fn".into());

                // Clean up the name (remove parameters if present)
                let clean_name = name.split('(').next().unwrap_or(&name).trim().to_string();

                let id = format!("{}::{}", parent_id, clean_name);
                let loc = count_lines(child);
                let return_type = extract_return_type(child, source);
                let parameters = declarator
                    .map(|d| extract_parameters(d, source))
                    .unwrap_or_default();
                let complexity = calculate_complexity(child);

                let is_main = clean_name == "main";

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

                debug!(name = %clean_name, kind = "Room", "Found function");
                entities.push(GameEntity::Room {
                    id,
                    name: clean_name,
                    room_type: "function".to_string(),
                    is_main,
                    is_async: false,
                    visibility: "public".to_string(),
                    complexity,
                    loc,
                    parameters,
                    return_type,
                    calls,
                    children,
                });
            }

            // --- DECLARATIONS ---
            "declaration" => {
                // Check for function declarations or variable declarations
                let mut decl_cursor = child.walk();
                for decl_child in child.children(&mut decl_cursor) {
                    if decl_child.kind() == "function_declarator" {
                        let name = decl_child
                            .child_by_field_name("declarator")
                            .map(|n| get_text(n, source))
                            .unwrap_or_else(|| "method".into());

                        let id = format!("{}::{}", parent_id, name);
                        let loc = count_lines(child);
                        let return_type = child
                            .child_by_field_name("type")
                            .map(|n| get_text(n, source));
                        let parameters = extract_parameters(decl_child, source);
                        let visibility = get_access_specifier(child, source);

                        entities.push(GameEntity::Room {
                            id,
                            name,
                            room_type: "method_declaration".to_string(),
                            is_main: false,
                            is_async: false,
                            visibility: visibility.to_string(),
                            complexity: 1,
                            loc,
                            parameters,
                            return_type,
                            calls: vec![],
                            children: vec![],
                        });
                    } else if decl_child.kind() == "init_declarator"
                        || decl_child.kind() == "identifier"
                    {
                        // Variable declaration
                        let name = if decl_child.kind() == "init_declarator" {
                            decl_child
                                .child_by_field_name("declarator")
                                .map(|n| get_text(n, source))
                                .unwrap_or_default()
                        } else {
                            get_text(decl_child, source)
                        };

                        if !name.is_empty() {
                            let datatype = child
                                .child_by_field_name("type")
                                .map(|n| get_text(n, source))
                                .unwrap_or_else(|| "auto".to_string());

                            let id = format!("{}::{}", parent_id, name);
                            let is_const = get_text(child, source).contains("const ");

                            trace!(name = %name, kind = "Artifact", "Found variable");
                            entities.push(GameEntity::Artifact {
                                id,
                                name,
                                artifact_type: if is_const { "constant" } else { "variable" }
                                    .to_string(),
                                datatype,
                                is_mutable: !is_const,
                                value_hint: None,
                            });
                        }
                    }
                }
            }

            // --- FIELD DECLARATIONS (class members) ---
            "field_declaration" => {
                let datatype = child
                    .child_by_field_name("type")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "auto".to_string());

                let mut field_cursor = child.walk();
                for field_child in child.children(&mut field_cursor) {
                    if field_child.kind() == "field_identifier" {
                        let name = get_text(field_child, source);
                        let id = format!("{}::{}", parent_id, name);

                        entities.push(GameEntity::Artifact {
                            id,
                            name,
                            artifact_type: "field".to_string(),
                            datatype: datatype.clone(),
                            is_mutable: true,
                            value_hint: None,
                        });
                    }
                }
            }

            // --- TEMPLATES ---
            "template_declaration" => {
                // Parse the templated entity
                entities.extend(parse_node(child, source, parent_id, imports));
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
