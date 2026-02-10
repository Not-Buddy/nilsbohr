use crate::models::{GameEntity, Parameter};
use tracing::{debug, instrument, trace};
use tree_sitter::{Node, Parser};

/// Parse Python code (.py) and return (entities, imports)
#[instrument(skip(source))]
pub fn parse_python_code(source: &str, parent_id: &str) -> (Vec<GameEntity>, Vec<String>) {
    let mut parser = Parser::new();

    parser
        .set_language(tree_sitter_python::language())
        .expect("Error loading Python grammar");

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
            let kind = child.kind();
            match kind {
                "identifier" => {
                    let name = get_text(child, source);
                    if !name.is_empty() && name != "self" && name != "cls" {
                        params.push(Parameter {
                            name,
                            datatype: "Any".to_string(),
                        });
                    }
                }
                "typed_parameter" => {
                    let name = child
                        .child_by_field_name("name")
                        .map(|n| get_text(n, source))
                        .unwrap_or_default();
                    let datatype = child
                        .child_by_field_name("type")
                        .map(|n| get_text(n, source))
                        .unwrap_or_else(|| "Any".to_string());
                    if !name.is_empty() && name != "self" && name != "cls" {
                        params.push(Parameter { name, datatype });
                    }
                }
                "default_parameter" | "typed_default_parameter" => {
                    let name = child
                        .child_by_field_name("name")
                        .map(|n| get_text(n, source))
                        .unwrap_or_default();
                    let datatype = child
                        .child_by_field_name("type")
                        .map(|n| get_text(n, source))
                        .unwrap_or_else(|| "Any".to_string());
                    if !name.is_empty() && name != "self" && name != "cls" {
                        params.push(Parameter { name, datatype });
                    }
                }
                "list_splat_pattern" | "dictionary_splat_pattern" => {
                    // *args, **kwargs
                    let name = get_text(child, source);
                    if !name.is_empty() {
                        params.push(Parameter {
                            name,
                            datatype: "Any".to_string(),
                        });
                    }
                }
                _ => {}
            }
        }
    }
    params
}

fn extract_return_type(node: Node, source: &[u8]) -> Option<String> {
    node.child_by_field_name("return_type")
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
    if node.kind() == "call"
        && let Some(func_node) = node.child_by_field_name("function") {
            let func_name = get_text(func_node, source);
            // Get the last part of a dotted name (e.g., "self.method" -> "method")
            let clean_name = func_name
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
        "print"
            | "len"
            | "range"
            | "str"
            | "int"
            | "float"
            | "list"
            | "dict"
            | "set"
            | "tuple"
            | "bool"
            | "type"
            | "isinstance"
            | "issubclass"
            | "hasattr"
            | "getattr"
            | "setattr"
            | "delattr"
            | "open"
            | "input"
            | "abs"
            | "max"
            | "min"
            | "sum"
            | "sorted"
            | "reversed"
            | "enumerate"
            | "zip"
            | "map"
            | "filter"
            | "any"
            | "all"
            | "next"
            | "iter"
            | "super"
            | "object"
            | "staticmethod"
            | "classmethod"
            | "property"
            | "Exception"
            | "ValueError"
            | "TypeError"
            | "KeyError"
            | "IndexError"
            | "AttributeError"
            | "RuntimeError"
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
        | "elif_clause"
        | "for_statement"
        | "while_statement"
        | "except_clause"
        | "with_statement"
        | "conditional_expression"  // ternary
        | "list_comprehension"
        | "dictionary_comprehension"
        | "set_comprehension"
        | "generator_expression" => {
            *complexity += 1;
        }
        "match_statement" => {
            *complexity += 1;
        }
        "case_clause" => {
            *complexity += 1;
        }
        _ => {}
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        count_complexity_nodes(child, complexity);
    }
}

fn is_async_function(node: Node, source: &[u8]) -> bool {
    // Check if the function has async keyword
    get_text(node, source).trim().starts_with("async")
}

fn has_decorator(node: Node, decorator_name: &str, source: &[u8]) -> bool {
    // Look for decorator in parent or sibling nodes
    if let Some(parent) = node.parent()
        && parent.kind() == "decorated_definition" {
            let mut cursor = parent.walk();
            for child in parent.children(&mut cursor) {
                if child.kind() == "decorator" {
                    let text = get_text(child, source);
                    if text.contains(decorator_name) {
                        return true;
                    }
                }
            }
        }
    false
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
                // import foo, bar
                let mut import_cursor = child.walk();
                for import_child in child.children(&mut import_cursor) {
                    if import_child.kind() == "dotted_name" {
                        let module = get_text(import_child, source);
                        if !module.is_empty() {
                            imports.push(format!("{}.py", module.replace('.', "/")));
                        }
                    }
                }
            }
            "import_from_statement" => {
                // from foo import bar
                if let Some(module_node) = child.child_by_field_name("module_name") {
                    let module = get_text(module_node, source);
                    if module.starts_with('.') {
                        // Relative import
                        imports.push(format!("{}.py", module.trim_start_matches('.')));
                    }
                }
            }

            // --- BUILDINGS (Classes) ---
            "class_definition" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "AnonymousClass".into());

                let id = format!("{}::{}", parent_id, name);
                let loc = count_lines(child);

                // Check for public (no leading underscore)
                let is_public = !name.starts_with('_');

                // Parse class body
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
                    is_public,
                    loc,
                    imports: vec![],
                    children,
                });
            }

            // --- ROOMS (Functions, Methods) ---
            "function_definition" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| get_text(n, source))
                    .unwrap_or_else(|| "fn".into());

                let id = format!("{}::{}", parent_id, name);
                let loc = count_lines(child);
                let is_async_fn = is_async_function(child, source);
                let parameters = extract_parameters(child, source);
                let return_type = extract_return_type(child, source);
                let complexity = calculate_complexity(child);

                // Determine visibility based on naming convention
                let visibility = if name.starts_with("__") && !name.ends_with("__") {
                    "private" // name mangling
                } else if name.starts_with('_') {
                    "protected"
                } else {
                    "public"
                };

                // Check if this is the main entry point
                let is_main = name == "main" || name == "__main__";

                // Determine room type
                let room_type = if has_decorator(child, "staticmethod", source) {
                    "static_method"
                } else if has_decorator(child, "classmethod", source) {
                    "class_method"
                } else if has_decorator(child, "property", source) {
                    "property"
                } else if parameters
                    .iter()
                    .any(|p| p.name == "self" || p.name == "cls")
                    || parent_id.contains("::")
                // Inside a class
                {
                    "method"
                } else {
                    "function"
                };

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

                debug!(name = %name, kind = "Room", "Found function");
                entities.push(GameEntity::Room {
                    id,
                    name,
                    room_type: room_type.to_string(),
                    is_main,
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

            // --- DECORATED DEFINITIONS ---
            "decorated_definition" => {
                // Parse the actual definition inside
                entities.extend(parse_node(child, source, parent_id, imports));
            }

            // --- ARTIFACTS (Variables, Constants) ---
            "expression_statement" => {
                // Check for assignments inside expression statements
                let mut expr_cursor = child.walk();
                for expr_child in child.children(&mut expr_cursor) {
                    if expr_child.kind() == "assignment" {
                        entities.extend(parse_assignment(expr_child, source, parent_id));
                    }
                }
            }
            "assignment" => {
                entities.extend(parse_assignment(child, source, parent_id));
            }

            // --- IF __NAME__ == "__MAIN__" block ---
            "if_statement" => {
                // Check if this is the main guard
                if let Some(condition) = child.child_by_field_name("condition") {
                    let cond_text = get_text(condition, source);
                    if cond_text.contains("__name__") && cond_text.contains("__main__") {
                        // This is the main entry block - parse its contents
                        if let Some(consequence) = child.child_by_field_name("consequence") {
                            let main_children = parse_node(consequence, source, parent_id, imports);

                            // Create a special "main" room for this block
                            entities.push(GameEntity::Room {
                                id: format!("{}::__main_guard__", parent_id),
                                name: "__main__".to_string(),
                                room_type: "main_guard".to_string(),
                                is_main: true,
                                is_async: false,
                                visibility: "public".to_string(),
                                complexity: calculate_complexity(child),
                                loc: count_lines(child),
                                parameters: vec![],
                                return_type: None,
                                calls: extract_function_calls(child, source),
                                children: main_children,
                            });
                        }
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

/// Parse assignment statements into Artifacts
fn parse_assignment(node: Node, source: &[u8], parent_id: &str) -> Vec<GameEntity> {
    let mut entities = Vec::new();

    if let Some(left) = node.child_by_field_name("left") {
        let name = get_text(left, source);

        // Skip if it looks like an attribute assignment (self.x = ...)
        if name.contains('.') {
            return entities;
        }

        let id = format!("{}::{}", parent_id, name);

        // Check for type annotation
        let datatype = node
            .child_by_field_name("type")
            .map(|n| get_text(n, source))
            .unwrap_or_else(|| "Any".to_string());

        // Determine if it's a constant (ALL_CAPS naming convention)
        let is_constant = name.chars().all(|c| c.is_uppercase() || c == '_');
        let artifact_type = if is_constant { "constant" } else { "variable" };

        // Get value hint
        let value_hint = node.child_by_field_name("right").map(|v| {
            let val = get_text(v, source);
            if val.len() > 30 {
                let truncated = val.chars().take(27).collect::<String>();
                format!("{}...", truncated)
            } else {
                val
            }
        });

        trace!(name = %name, kind = "Artifact", "Found variable");
        entities.push(GameEntity::Artifact {
            id,
            name,
            artifact_type: artifact_type.to_string(),
            datatype,
            is_mutable: !is_constant,
            value_hint,
        });
    }

    entities
}
