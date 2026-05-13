use crate::models::{GameEntity, Parameter};
use super::parser_utils;
use super::traits::LanguageParser;
use super::registry::JavaScriptParser;

use tracing::{debug, instrument, trace};
use tree_sitter::{Node, Parser};

impl LanguageParser for JavaScriptParser {
    fn parse(source: &str, parent_id: &str) -> (Vec<GameEntity>, Vec<String>) {
        let mut parser = Parser::new();
        parser
            .set_language(tree_sitter_javascript::language())
            .expect("Error loading JavaScript grammar");

        let tree = parser.parse(source, None).unwrap();
        let mut imports = Vec::new();
        let entities = parse_node(tree.root_node(), source.as_bytes(), parent_id, &mut imports);
        (entities, imports)
    }

    fn extensions() -> &'static [&'static str] {
        &["js", "jsx"]
    }
}

fn is_exported(node: Node, _source: &[u8]) -> bool {
    if let Some(parent) = node.parent()
        && parent.kind() == "export_statement"
    {
        return true;
    }
    node.children(&mut node.walk())
        .any(|c| c.kind() == "export")
}

fn is_async(node: Node, source: &[u8]) -> bool {
    parser_utils::get_text(node, source).trim().starts_with("async")
        || node.children(&mut node.walk()).any(|c| c.kind() == "async")
}

fn extract_parameters(node: Node, source: &[u8]) -> Vec<Parameter> {
    let mut params = Vec::new();
    if let Some(param_list) = node.child_by_field_name("parameters") {
        let mut cursor = param_list.walk();
        for child in param_list.children(&mut cursor) {
            let kind = child.kind();
            if kind == "identifier" || kind == "assignment_pattern" || kind == "rest_pattern" {
                let name = parser_utils::get_text(child, source);
                if !name.is_empty() && name != "(" && name != ")" && name != "," {
                    params.push(Parameter { name, datatype: "any".to_string() });
                }
            }
        }
    }
    params
}

fn is_builtin(name: &str) -> bool {
    if name.starts_with("console.") || name.starts_with("Math.") || name.starts_with("JSON.") {
        return true;
    }
    matches!(
        name,
        "window" | "document" | "global" | "globalThis" | "process" |
        "module" | "exports" | "require" | "__dirname" | "__filename" |
        "this" | "super" | "arguments" | "undefined" | "null" | "true" | "false" | "Infinity" | "NaN" |
        "console" | "log" | "error" | "warn" | "info" | "debug" | "table" | "trace" | "dir" | "assert" |
        "Promise" | "resolve" | "reject" | "then" | "catch" | "finally" |
        "all" | "race" | "allSettled" | "any" | "async" | "await" | "fetch" |
        "setTimeout" | "clearTimeout" | "setInterval" | "clearInterval" |
        "setImmediate" | "clearImmediate" | "requestAnimationFrame" | "cancelAnimationFrame" |
        "JSON" | "parse" | "stringify" |
        "map" | "filter" | "reduce" | "reduceRight" | "forEach" |
        "find" | "findIndex" | "findLast" | "findLastIndex" |
        "some" | "every" | "includes" | "indexOf" | "lastIndexOf" |
        "push" | "pop" | "shift" | "unshift" |
        "slice" | "splice" | "concat" | "join" |
        "sort" | "reverse" | "fill" | "flat" | "flatMap" |
        "entries" | "keys" | "values" | "from" | "isArray" | "of" |
        "split" | "replace" | "replaceAll" | "match" | "matchAll" | "search" |
        "substring" | "substr" | "trim" | "trimStart" | "trimEnd" |
        "toLowerCase" | "toUpperCase" | "toLocaleLowerCase" | "toLocaleUpperCase" |
        "charAt" | "charCodeAt" | "codePointAt" |
        "startsWith" | "endsWith" | "repeat" | "padStart" | "padEnd" |
        "Object" | "assign" | "create" | "freeze" | "seal" | "isFrozen" | "isSealed" |
        "hasOwnProperty" | "isPrototypeOf" | "propertyIsEnumerable" |
        "toString" | "valueOf" | "toLocaleString" |
        "Math" | "min" | "max" | "floor" | "ceil" | "round" | "abs" | "random" |
        "sqrt" | "pow" | "sin" | "cos" | "tan" | "atan" | "exp" |
        "String" | "Number" | "Boolean" | "Symbol" | "BigInt" |
        "Date" | "RegExp" | "Error" | "Function" | "Array" |
        "Map" | "Set" | "WeakMap" | "WeakSet" |
        "alert" | "prompt" | "confirm" |
        "addEventListener" | "removeEventListener" | "dispatchEvent" |
        "localStorage" | "sessionStorage" | "navigator" | "location" | "history" |
        "parseInt" | "parseFloat" | "isNaN" | "isFinite" |
        "encodeURI" | "decodeURI" | "encodeURIComponent" | "decodeURIComponent" | "eval"
    )
}

const JS_COMPLEXITY_KINDS: &[&str] = &[
    "if_statement", "switch_statement", "while_statement",
    "for_statement", "for_in_statement", "for_of_statement",
    "catch_clause", "ternary_expression", "optional_chain_expression",
    "switch_case",
];

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
                if let Some(source_node) = child.child_by_field_name("source") {
                    let import_path = parser_utils::get_text(source_node, source)
                        .trim_matches(|c| c == '"' || c == '\'' || c == '`')
                        .to_string();
                    if import_path.starts_with("./") || import_path.starts_with("../") {
                        let ext = if import_path.ends_with(".js") || import_path.ends_with(".jsx") { "" } else { ".js" };
                        imports.push(format!("{import_path}{ext}"));
                    }
                }
            }

            "lexical_declaration" | "variable_declaration" => {
                let mut decl_cursor = child.walk();
                for decl in child.children(&mut decl_cursor) {
                    if decl.kind() == "variable_declarator"
                        && let Some(value) = decl.child_by_field_name("value")
                        && value.kind() == "call_expression"
                    {
                        let func = value
                            .child_by_field_name("function")
                            .map(|n| parser_utils::get_text(n, source))
                            .unwrap_or_default();
                        if func == "require"
                            && let Some(args) = value.child_by_field_name("arguments")
                        {
                            let path = parser_utils::get_text(args, source)
                                .trim_matches(|c| c == '(' || c == ')' || c == '"' || c == '\'')
                                .to_string();
                            if path.starts_with("./") || path.starts_with("../") {
                                imports.push(format!("{path}.js"));
                            }
                        }
                    }
                }
                entities.extend(parse_variables(child, source, parent_id, imports));
            }

            "class_declaration" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| parser_utils::get_text(n, source))
                    .unwrap_or_else(|| "AnonymousClass".into());
                let id = format!("{parent_id}::{name}");
                let is_public = is_exported(child, source);
                let loc = parser_utils::count_lines(child);
                let children = parse_node(child, source, &id, imports);

                debug!(name = %name, kind = "Building", "Found class");
                entities.push(GameEntity::Building {
                    id, name, building_type: "class".to_string(), is_public, loc,
                    imports: vec![], children, metadata: None,
                });
            }

            "function_declaration" | "generator_function_declaration" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| parser_utils::get_text(n, source))
                    .unwrap_or_else(|| "fn".into());
                let id = format!("{parent_id}::{name}");
                let loc = parser_utils::count_lines(child);
                let is_async_fn = is_async(child, source);
                let parameters = extract_parameters(child, source);
                let visibility = if is_exported(child, source) { "public" } else { "private" };
                let complexity = parser_utils::calculate_complexity(child, JS_COMPLEXITY_KINDS);
                let calls = child.child_by_field_name("body")
                    .map(|body| parser_utils::extract_function_calls(body, source, "call_expression", is_builtin))
                    .unwrap_or_default();
                let children = parse_function_body(child, source, &id, imports);

                debug!(name = %name, kind = "Room", "Found function");
                entities.push(GameEntity::Room {
                    id, name, room_type: "function".to_string(),
                    is_main: false, is_async: is_async_fn, visibility: visibility.to_string(),
                    complexity, loc, parameters, return_type: None, calls, children, metadata: None,
                });
            }

            "method_definition" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| parser_utils::get_text(n, source))
                    .unwrap_or_else(|| "method".into());
                let id = format!("{parent_id}::{name}");
                let loc = parser_utils::count_lines(child);
                let is_async_fn = is_async(child, source);
                let parameters = extract_parameters(child, source);
                let complexity = parser_utils::calculate_complexity(child, JS_COMPLEXITY_KINDS);
                let calls = child.child_by_field_name("body")
                    .map(|body| parser_utils::extract_function_calls(body, source, "call_expression", is_builtin))
                    .unwrap_or_default();
                let children = parse_function_body(child, source, &id, imports);

                entities.push(GameEntity::Room {
                    id, name, room_type: "method".to_string(),
                    is_main: false, is_async: is_async_fn, visibility: "public".to_string(),
                    complexity, loc, parameters, return_type: None, calls, children, metadata: None,
                });
            }

            "field_definition" => {
                let name = child
                    .child_by_field_name("property")
                    .or_else(|| child.child_by_field_name("name"))
                    .map(|n| parser_utils::get_text(n, source))
                    .unwrap_or_else(|| "field".into());
                let id = format!("{parent_id}::{name}");

                entities.push(GameEntity::Artifact {
                    id, name, artifact_type: "field".to_string(), datatype: "any".to_string(),
                    is_mutable: true, value_hint: None, metadata: None,
                });
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

fn parse_variables(
    node: Node,
    source: &[u8],
    parent_id: &str,
    imports: &mut Vec<String>,
) -> Vec<GameEntity> {
    let mut entities = Vec::new();
    let mut decl_cursor = node.walk();

    for decl in node.children(&mut decl_cursor) {
        if decl.kind() == "variable_declarator" {
            let name = decl
                .child_by_field_name("name")
                .map(|n| parser_utils::get_text(n, source))
                .unwrap_or_else(|| "var".into());
            let value_node = decl.child_by_field_name("value");
            let id = format!("{parent_id}::{name}");

            if let Some(val) = value_node
                && val.kind() == "arrow_function"
            {
                let loc = parser_utils::count_lines(val);
                let is_async_fn = is_async(val, source);
                let parameters = extract_parameters(val, source);
                let complexity = parser_utils::calculate_complexity(val, JS_COMPLEXITY_KINDS);
                let calls = parser_utils::extract_function_calls(val, source, "call_expression", is_builtin);
                let children = parse_function_body(val, source, &id, imports);

                debug!(name = %name, kind = "Room", "Found arrow function");
                entities.push(GameEntity::Room {
                    id, name, room_type: "arrow_function".to_string(),
                    is_main: false, is_async: is_async_fn,
                    visibility: if is_exported(node, source) { "public" } else { "private" }.to_string(),
                    complexity, loc, parameters, return_type: None, calls, children, metadata: None,
                });
                continue;
            }

            let artifact_type = if parser_utils::get_text(node, source).starts_with("const") { "constant" } else { "variable" };
            let value_hint = value_node.map(|v| {
                let val = parser_utils::get_text(v, source);
                if val.len() > 30 { format!("{}...", val.chars().take(27).collect::<String>()) } else { val }
            });

            trace!(name = %name, kind = "Artifact", "Found variable");
            entities.push(GameEntity::Artifact {
                id, name, artifact_type: artifact_type.to_string(), datatype: "any".to_string(),
                is_mutable: !parser_utils::get_text(node, source).starts_with("const"), value_hint, metadata: None,
            });
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
