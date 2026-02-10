use crate::models::{GameEntity, Parameter};
use tracing::{debug, instrument, trace};
use tree_sitter::{Node, Parser};

/// Parse C code (.c) and return (entities, imports)
#[instrument(skip(source))]
pub fn parse_c_code(source: &str, parent_id: &str) -> (Vec<GameEntity>, Vec<String>) {
    let mut parser = Parser::new();

    parser
        .set_language(tree_sitter_c::language())
        .expect("Error loading C grammar");

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
                    .unwrap_or_else(|| "int".to_string());
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
    if node.kind() == "call_expression"
        && let Some(func_node) = node.child_by_field_name("function") {
            let func_name = get_text(func_node, source);
            if !func_name.is_empty() {
                calls.push(func_name);
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
        "printf"
            | "scanf"
            | "fprintf"
            | "fscanf"
            | "sprintf"
            | "sscanf"
            | "puts"
            | "gets"
            | "putchar"
            | "getchar"
            | "malloc"
            | "calloc"
            | "realloc"
            | "free"
            | "memcpy"
            | "memset"
            | "memmove"
            | "memcmp"
            | "strlen"
            | "strcpy"
            | "strncpy"
            | "strcat"
            | "strncat"
            | "strcmp"
            | "strncmp"
            | "strchr"
            | "strrchr"
            | "strstr"
            | "atoi"
            | "atof"
            | "atol"
            | "strtol"
            | "strtod"
            | "fopen"
            | "fclose"
            | "fread"
            | "fwrite"
            | "fgets"
            | "fputs"
            | "fseek"
            | "ftell"
            | "rewind"
            | "exit"
            | "abort"
            | "assert"
            | "sizeof"
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
        | "while_statement"
        | "do_statement"
        | "switch_statement"
        | "case_statement"
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

            // --- STRUCTS (Buildings) ---
            "struct_specifier" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "AnonymousStruct".into());

                let id = format!("{}::{}", parent_id, name);
                let loc = count_lines(child);

                let children = if let Some(body) = child.child_by_field_name("body") {
                    parse_node(body, source, &id, imports)
                } else {
                    vec![]
                };

                debug!(name = %name, kind = "Building", "Found struct");
                entities.push(GameEntity::Building {
                    id,
                    name,
                    building_type: "struct".to_string(),
                    is_public: true,
                    loc,
                    imports: vec![],
                    children,
                });
            }

            // --- ENUMS (Buildings) ---
            "enum_specifier" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "AnonymousEnum".into());

                let id = format!("{}::{}", parent_id, name);
                let loc = count_lines(child);

                let children = if let Some(body) = child.child_by_field_name("body") {
                    parse_enum_values(body, source, &id)
                } else {
                    vec![]
                };

                debug!(name = %name, kind = "Building", "Found enum");
                entities.push(GameEntity::Building {
                    id,
                    name,
                    building_type: "enum".to_string(),
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

                // Clean up the name
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

            // --- DECLARATIONS (Variables, typedefs) ---
            "declaration" => {
                let datatype = child
                    .child_by_field_name("type")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "int".to_string());

                let mut decl_cursor = child.walk();
                for decl_child in child.children(&mut decl_cursor) {
                    if decl_child.kind() == "init_declarator" || decl_child.kind() == "identifier" {
                        let name = if decl_child.kind() == "init_declarator" {
                            decl_child
                                .child_by_field_name("declarator")
                                .map(|n| get_text(n, source))
                                .unwrap_or_default()
                        } else {
                            get_text(decl_child, source)
                        };

                        if !name.is_empty() {
                            let id = format!("{}::{}", parent_id, name);
                            let is_const = get_text(child, source).contains("const ");

                            trace!(name = %name, kind = "Artifact", "Found variable");
                            entities.push(GameEntity::Artifact {
                                id,
                                name,
                                artifact_type: if is_const { "constant" } else { "variable" }
                                    .to_string(),
                                datatype: datatype.clone(),
                                is_mutable: !is_const,
                                value_hint: None,
                            });
                        }
                    }
                }
            }

            // --- FIELD DECLARATIONS (struct members) ---
            "field_declaration" => {
                let datatype = child
                    .child_by_field_name("type")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "int".to_string());

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

/// Parse enum values as artifacts
fn parse_enum_values(node: Node, source: &[u8], parent_id: &str) -> Vec<GameEntity> {
    let mut entities = Vec::new();
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        if child.kind() == "enumerator" {
            let name = child
                .child_by_field_name("name")
                .map(|n| get_text(n, source))
                .unwrap_or_default();

            if !name.is_empty() {
                let id = format!("{}::{}", parent_id, name);
                let value_hint = child
                    .child_by_field_name("value")
                    .map(|n| get_text(n, source));

                entities.push(GameEntity::Artifact {
                    id,
                    name,
                    artifact_type: "enum_value".to_string(),
                    datatype: "int".to_string(),
                    is_mutable: false,
                    value_hint,
                });
            }
        }
    }
    entities
}
