use crate::models::{GameEntity, Parameter};
use super::parser_utils;
use super::traits::LanguageParser;
use super::registry::PythonParser;

use tracing::{debug, instrument, trace};
use tree_sitter::{Node, Parser};

impl LanguageParser for PythonParser {
    fn parse(source: &str, parent_id: &str) -> (Vec<GameEntity>, Vec<String>) {
        let mut parser = Parser::new();
        parser
            .set_language(tree_sitter_python::language())
            .expect("Error loading Python grammar");

        let tree = parser.parse(source, None).unwrap();
        let mut imports = Vec::new();
        let entities = parse_node(tree.root_node(), source.as_bytes(), parent_id, &mut imports);
        (entities, imports)
    }

    fn extensions() -> &'static [&'static str] {
        &["py"]
    }
}

fn extract_parameters(node: Node, source: &[u8]) -> Vec<Parameter> {
    let mut params = Vec::new();
    if let Some(param_list) = node.child_by_field_name("parameters") {
        let mut cursor = param_list.walk();
        for child in param_list.children(&mut cursor) {
            let kind = child.kind();
            match kind {
                "identifier" => {
                    let name = parser_utils::get_text(child, source);
                    if !name.is_empty() && name != "self" && name != "cls" {
                        params.push(Parameter { name, datatype: "Any".to_string() });
                    }
                }
                "typed_parameter" => {
                    let name = child.child_by_field_name("name").map(|n| parser_utils::get_text(n, source)).unwrap_or_default();
                    let datatype = child.child_by_field_name("type").map(|n| parser_utils::get_text(n, source)).unwrap_or_else(|| "Any".to_string());
                    if !name.is_empty() && name != "self" && name != "cls" {
                        params.push(Parameter { name, datatype });
                    }
                }
                "default_parameter" | "typed_default_parameter" => {
                    let name = child.child_by_field_name("name").map(|n| parser_utils::get_text(n, source)).unwrap_or_default();
                    let datatype = child.child_by_field_name("type").map(|n| parser_utils::get_text(n, source)).unwrap_or_else(|| "Any".to_string());
                    if !name.is_empty() && name != "self" && name != "cls" {
                        params.push(Parameter { name, datatype });
                    }
                }
                "list_splat_pattern" | "dictionary_splat_pattern" => {
                    let name = parser_utils::get_text(child, source);
                    if !name.is_empty() {
                        params.push(Parameter { name, datatype: "Any".to_string() });
                    }
                }
                _ => {}
            }
        }
    }
    params
}

fn extract_return_type(node: Node, source: &[u8]) -> Option<String> {
    node.child_by_field_name("return_type").map(|n| parser_utils::get_text(n, source))
}

fn is_builtin(name: &str) -> bool {
    matches!(
        name,
        "print" | "input" | "open" | "help" | "dir" | "vars" | "globals" | "locals" |
        "id" | "hash" | "type" | "object" | "len" | "repr" | "ascii" | "format" | "breakpoint" |
        "bool" | "int" | "float" | "complex" | "str" | "bytes" | "bytearray" |
        "list" | "tuple" | "set" | "frozenset" | "dict" | "range" | "slice" |
        "memoryview" | "super" |
        "abs" | "min" | "max" | "sum" | "round" | "pow" | "divmod" |
        "bin" | "hex" | "oct" | "ord" | "chr" |
        "enumerate" | "zip" | "map" | "filter" | "reversed" | "sorted" |
        "all" | "any" | "next" | "iter" | "aiter" | "anext" |
        "eval" | "exec" | "compile" | "__import__" |
        "isinstance" | "issubclass" | "hasattr" | "getattr" | "setattr" | "delattr" | "callable" |
        "staticmethod" | "classmethod" | "property" |
        "BaseException" | "Exception" | "ArithmeticError" | "BufferError" |
        "LookupError" | "AssertionError" | "AttributeError" | "EOFError" |
        "FloatingPointError" | "GeneratorExit" | "ImportError" |
        "ModuleNotFoundError" | "IndexError" | "KeyError" | "KeyboardInterrupt" |
        "MemoryError" | "NameError" | "NotImplementedError" | "OSError" |
        "OverflowError" | "RecursionError" | "ReferenceError" | "RuntimeError" |
        "StopIteration" | "StopAsyncIteration" | "SyntaxError" | "IndentationError" |
        "TabError" | "SystemError" | "SystemExit" | "TypeError" |
        "UnboundLocalError" | "UnicodeError" | "ValueError" | "ZeroDivisionError" |
        "EnvironmentError" | "IOError" | "WindowsError" | "BlockingIOError" |
        "ChildProcessError" | "ConnectionError" | "BrokenPipeError" |
        "ConnectionAbortedError" | "ConnectionRefusedError" | "ConnectionResetError" |
        "FileExistsError" | "FileNotFoundError" | "InterruptedError" |
        "IsADirectoryError" | "NotADirectoryError" | "PermissionError" |
        "ProcessLookupError" | "TimeoutError" |
        "Warning" | "UserWarning" | "DeprecationWarning" | "PendingDeprecationWarning" |
        "SyntaxWarning" | "RuntimeWarning" | "FutureWarning" | "ImportWarning" |
        "UnicodeWarning" | "BytesWarning" | "ResourceWarning"
    )
}

const PY_COMPLEXITY_KINDS: &[&str] = &[
    "if_statement", "elif_clause", "for_statement", "while_statement",
    "except_clause", "with_statement", "conditional_expression",
    "list_comprehension", "dictionary_comprehension", "set_comprehension",
    "generator_expression", "match_statement", "case_clause",
];

fn is_async_function(node: Node, source: &[u8]) -> bool {
    parser_utils::get_text(node, source).trim().starts_with("async")
}

fn has_decorator(node: Node, decorator_name: &str, source: &[u8]) -> bool {
    if let Some(parent) = node.parent()
        && parent.kind() == "decorated_definition"
    {
        let mut cursor = parent.walk();
        for child in parent.children(&mut cursor) {
            if child.kind() == "decorator" {
                let text = parser_utils::get_text(child, source);
                if text.contains(decorator_name) {
                    return true;
                }
            }
        }
    }
    false
}

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
            "import_statement" => {
                let mut import_cursor = child.walk();
                for import_child in child.children(&mut import_cursor) {
                    if import_child.kind() == "dotted_name" {
                        let module = parser_utils::get_text(import_child, source);
                        if !module.is_empty() {
                            imports.push(format!("{}.py", module.replace('.', "/")));
                        }
                    }
                }
            }
            "import_from_statement" => {
                if let Some(module_node) = child.child_by_field_name("module_name") {
                    let module = parser_utils::get_text(module_node, source);
                    if module.starts_with('.') {
                        imports.push(format!("{}.py", module.trim_start_matches('.')));
                    }
                }
            }

            "class_definition" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| parser_utils::get_text(n, source))
                    .unwrap_or_else(|| "AnonymousClass".into());
                let id = format!("{parent_id}::{name}");
                let loc = parser_utils::count_lines(child);
                let is_public = !name.starts_with('_');
                let children = child.child_by_field_name("body")
                    .map(|body| parse_node(body, source, &id, imports))
                    .unwrap_or_default();

                debug!(name = %name, kind = "Building", "Found class");
                entities.push(GameEntity::Building {
                    id, name, building_type: "class".to_string(), is_public, loc,
                    imports: vec![], children, metadata: None,
                });
            }

            "function_definition" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| parser_utils::get_text(n, source))
                    .unwrap_or_else(|| "fn".into());
                let id = format!("{parent_id}::{name}");
                let loc = parser_utils::count_lines(child);
                let is_async_fn = is_async_function(child, source);
                let parameters = extract_parameters(child, source);
                let return_type = extract_return_type(child, source);
                let complexity = parser_utils::calculate_complexity(child, PY_COMPLEXITY_KINDS);

                let visibility = if name.starts_with("__") && !name.ends_with("__") { "private" }
                else if name.starts_with('_') { "protected" }
                else { "public" };

                let is_main = name == "main" || name == "__main__";
                let room_type = if has_decorator(child, "staticmethod", source) { "static_method" }
                else if has_decorator(child, "classmethod", source) { "class_method" }
                else if has_decorator(child, "property", source) { "property" }
                else if parameters.iter().any(|p| p.name == "self" || p.name == "cls")
                    || parent_id.contains("::") { "method" }
                else { "function" };

                let body = child.child_by_field_name("body");
                let calls = body
                    .map(|b| parser_utils::extract_function_calls(b, source, "call", is_builtin))
                    .unwrap_or_default();
                let children = body
                    .map(|b| parse_node(b, source, &id, imports))
                    .unwrap_or_default();

                debug!(name = %name, kind = "Room", "Found function");
                entities.push(GameEntity::Room {
                    id, name, room_type: room_type.to_string(), is_main, is_async: is_async_fn,
                    visibility: visibility.to_string(), complexity, loc, parameters,
                    return_type, calls, children, metadata: None,
                });
            }

            "decorated_definition" => {
                entities.extend(parse_node(child, source, parent_id, imports));
            }

            "expression_statement" => {
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

            "if_statement" => {
                if let Some(condition) = child.child_by_field_name("condition") {
                    let cond_text = parser_utils::get_text(condition, source);
                    if cond_text.contains("__name__") && cond_text.contains("__main__") {
                        if let Some(consequence) = child.child_by_field_name("consequence") {
                            let main_children = parse_node(consequence, source, parent_id, imports);
                            entities.push(GameEntity::Room {
                                id: format!("{parent_id}::__main_guard__"),
                                name: "__main__".to_string(),
                                room_type: "main_guard".to_string(), is_main: true, is_async: false,
                                visibility: "public".to_string(),
                                complexity: parser_utils::calculate_complexity(child, PY_COMPLEXITY_KINDS),
                                loc: parser_utils::count_lines(child), parameters: vec![],
                                return_type: None,
                                calls: parser_utils::extract_function_calls(child, source, "call", is_builtin),
                                children: main_children, metadata: None,
                            });
                        }
                    }
                }
            }

            _ => {
                if child.child_count() > 0 {
                    entities.extend(parse_node(child, source, parent_id, imports));
                }
            }
        }
    }
    entities
}

fn parse_assignment(node: Node, source: &[u8], parent_id: &str) -> Vec<GameEntity> {
    let mut entities = Vec::new();
    if let Some(left) = node.child_by_field_name("left") {
        let name = parser_utils::get_text(left, source);
        if name.contains('.') { return entities; }

        let id = format!("{parent_id}::{name}");
        let datatype = node.child_by_field_name("type")
            .map(|n| parser_utils::get_text(n, source))
            .unwrap_or_else(|| "Any".to_string());
        let is_constant = name.chars().all(|c| c.is_uppercase() || c == '_');
        let artifact_type = if is_constant { "constant" } else { "variable" };

        let value_hint = node.child_by_field_name("right").map(|v| {
            let val = parser_utils::get_text(v, source);
            if val.len() > 30 { format!("{}...", val.chars().take(27).collect::<String>()) } else { val }
        });

        trace!(name = %name, kind = "Artifact", "Found variable");
        entities.push(GameEntity::Artifact {
            id, name, artifact_type: artifact_type.to_string(), datatype,
            is_mutable: !is_constant, value_hint, metadata: None,
        });
    }
    entities
}
