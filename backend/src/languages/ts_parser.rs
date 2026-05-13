use crate::models::{GameEntity, Parameter};
use super::parser_utils;
use super::traits::LanguageParser;
use super::registry::TypeScriptParser;

use tracing::{debug, instrument};
use tree_sitter::{Node, Parser};

impl LanguageParser for TypeScriptParser {
    fn parse(source: &str, parent_id: &str) -> (Vec<GameEntity>, Vec<String>) {
        let mut parser = Parser::new();
        parser
            .set_language(tree_sitter_typescript::language_typescript())
            .expect("Error loading TypeScript grammar");

        let tree = parser.parse(source, None).unwrap();
        let mut imports = Vec::new();
        let entities = parse_node(tree.root_node(), source.as_bytes(), parent_id, &mut imports);
        (entities, imports)
    }

    fn extensions() -> &'static [&'static str] {
        &["ts", "tsx"]
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
            if kind == "required_parameter" || kind == "optional_parameter" || kind == "identifier" {
                let name = if kind == "identifier" {
                    parser_utils::get_text(child, source)
                } else {
                    child
                        .child_by_field_name("pattern")
                        .map(|n| parser_utils::get_text(n, source))
                        .unwrap_or_default()
                };
                let datatype = child
                    .child_by_field_name("type")
                    .map(|t| parser_utils::get_text(t, source).trim_start_matches(": ").to_string())
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
        .map(|n| parser_utils::get_text(n, source).trim_start_matches(": ").to_string())
}

fn is_builtin(name: &str) -> bool {
    if name.starts_with("console.") || name.starts_with("Math.") || name.starts_with("JSON.") {
        return true;
    }
    matches!(
        name,
        "console" | "log" | "error" | "warn" | "info" | "debug" | "table" | "trace" | "dir" |
        "map" | "filter" | "reduce" | "reduceRight" | "forEach" |
        "find" | "findIndex" | "findLast" | "findLastIndex" |
        "some" | "every" | "includes" | "indexOf" | "lastIndexOf" |
        "push" | "pop" | "shift" | "unshift" |
        "slice" | "splice" | "concat" | "join" |
        "sort" | "reverse" | "fill" | "flat" | "flatMap" |
        "entries" | "keys" | "values" | "from" | "isArray" |
        "Object" | "assign" | "create" | "freeze" | "seal" |
        "hasOwnProperty" | "toString" | "valueOf" | "constructor" |
        "bind" | "call" | "apply" |
        "JSON" | "parse" | "stringify" |
        "Promise" | "then" | "catch" | "finally" |
        "resolve" | "reject" | "all" | "allSettled" | "race" | "any" |
        "async" | "await" | "fetch" |
        "Math" | "min" | "max" | "floor" | "ceil" | "round" | "abs" | "random" | "sqrt" | "pow" |
        "parseInt" | "parseFloat" | "isNaN" | "isFinite" |
        "String" | "Number" | "Boolean" | "Symbol" | "BigInt" | "RegExp" | "Date" | "Error" |
        "setTimeout" | "clearTimeout" | "setInterval" | "clearInterval" |
        "require" | "module" | "exports" | "process" |
        "window" | "document" | "global" | "globalThis" |
        "alert" | "prompt" | "confirm" | "addEventListener" | "removeEventListener"
    )
}

const TS_COMPLEXITY_KINDS: &[&str] = &[
    "if_statement", "switch_statement", "while_statement",
    "for_statement", "for_in_statement", "for_of_statement",
    "catch_clause", "ternary_expression", "optional_chain_expression",
    "switch_case",
];

fn make_doc_metadata(comments: Option<String>) -> Option<std::collections::HashMap<String, String>> {
    comments.map(|c| {
        let mut map = std::collections::HashMap::new();
        map.insert("documentation".to_string(), c);
        map
    })
}

fn get_comments(node: Node, source: &[u8]) -> Option<String> {
    let mut comments = Vec::new();
    let mut prev = node.prev_sibling();

    while let Some(p) = prev {
        if p.kind() == "comment" {
            let text = parser_utils::get_text(p, source);
            let clean = text
                .lines()
                .map(|l| {
                    l.trim()
                        .trim_start_matches("/**")
                        .trim_start_matches("/*")
                        .trim_start_matches("*/")
                        .trim_start_matches('*')
                        .trim_start_matches("//")
                        .trim()
                })
                .filter(|l| !l.is_empty())
                .collect::<Vec<_>>()
                .join(" ");
            comments.insert(0, clean);
            prev = p.prev_sibling();
        } else {
            break;
        }
    }

    if comments.is_empty() { None } else { Some(comments.join(" ")) }
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
        let comments = get_comments(child, source);

        match kind {
            "import_statement" => {
                if let Some(source_node) = child.child_by_field_name("source") {
                    let text = parser_utils::get_text(source_node, source);
                    let import_path = text.trim_matches(|c| c == '"' || c == '\'' || c == '`');
                    if import_path.starts_with('.') {
                        imports.push(format!("{import_path}.ts"));
                    }
                }
            }

            "class_declaration" | "abstract_class_declaration" | "interface_declaration" | "enum_declaration" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| parser_utils::get_text(n, source))
                    .unwrap_or_else(|| "Anonymous".into());
                let id = format!("{parent_id}::{name}");
                let is_public = is_exported(child, source);
                let loc = parser_utils::count_lines(child);
                let body_node = child.child_by_field_name("body").unwrap_or(child);
                let children = parse_node(body_node, source, &id, imports);
                let building_type = match kind {
                    "interface_declaration" => "interface",
                    "enum_declaration" => "enum",
                    _ => "class",
                };

                debug!(name = %name, kind = "Building", "Found {building_type}");
                entities.push(GameEntity::Building {
                    id, name, building_type: building_type.to_string(), is_public, loc,
                    imports: vec![], children, metadata: make_doc_metadata(comments),
                });
            }

            "type_alias_declaration" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| parser_utils::get_text(n, source))
                    .unwrap_or_else(|| "Type".into());
                let id = format!("{parent_id}::{name}");
                entities.push(GameEntity::Building {
                    id, name, building_type: "type_alias".to_string(),
                    is_public: is_exported(child, source), loc: parser_utils::count_lines(child),
                    imports: vec![], children: vec![], metadata: make_doc_metadata(comments),
                });
            }

            "function_declaration" | "generator_function_declaration" | "method_definition" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| parser_utils::get_text(n, source))
                    .unwrap_or_else(|| "anonymous".into());
                let id = format!("{parent_id}::{name}");
                let loc = parser_utils::count_lines(child);
                let is_async_fn = is_async(child, source);
                let parameters = extract_parameters(child, source);
                let return_type = extract_return_type(child, source);
                let complexity = parser_utils::calculate_complexity(child, TS_COMPLEXITY_KINDS);

                let visibility = if kind == "method_definition" {
                    let text = parser_utils::get_text(child, source);
                    if text.contains("private ") { "private" } else { "public" }
                } else if is_exported(child, source) { "public" } else { "private" };

                let body = child.child_by_field_name("body");
                let calls = body
                    .map(|b| parser_utils::extract_function_calls(b, source, "call_expression", is_builtin))
                    .unwrap_or_default();
                let children = body
                    .map(|b| parse_node(b, source, &id, imports))
                    .unwrap_or_default();

                entities.push(GameEntity::Room {
                    id, name,
                    room_type: if kind == "method_definition" { "method".into() } else { "function".into() },
                    is_main: false, is_async: is_async_fn, visibility: visibility.to_string(),
                    complexity, loc, parameters, return_type, calls, children,
                    metadata: make_doc_metadata(comments),
                });
            }

            "lexical_declaration" | "variable_declaration" => {
                let mut decl_cursor = child.walk();
                for decl in child
                    .children(&mut decl_cursor)
                    .filter(|c| c.kind() == "variable_declarator")
                {
                    let name = decl
                        .child_by_field_name("name")
                        .map(|n| parser_utils::get_text(n, source))
                        .unwrap_or_else(|| "var".into());
                    let id = format!("{parent_id}::{name}");
                    let value_node = decl.child_by_field_name("value");

                    if let Some(val) = value_node
                        && val.kind() == "arrow_function"
                    {
                        let loc = parser_utils::count_lines(val);
                        let is_async_fn = is_async(val, source);
                        let parameters = extract_parameters(val, source);
                        let return_type = extract_return_type(val, source);
                        let complexity = parser_utils::calculate_complexity(val, TS_COMPLEXITY_KINDS);
                        let body = val.child_by_field_name("body");
                        let calls = body
                            .map(|b| parser_utils::extract_function_calls(b, source, "call_expression", is_builtin))
                            .unwrap_or_default();
                        let children = body
                            .map(|b| parse_node(b, source, &id, imports))
                            .unwrap_or_default();

                        entities.push(GameEntity::Room {
                            id, name, room_type: "arrow_function".to_string(),
                            is_main: false, is_async: is_async_fn,
                            visibility: if is_exported(child, source) { "public" } else { "private" }.into(),
                            complexity, loc, parameters, return_type, calls, children,
                            metadata: make_doc_metadata(comments.clone()),
                        });
                        continue;
                    }

                    let is_const = parser_utils::get_text(child, source).starts_with("const");
                    let datatype = decl
                        .child_by_field_name("type")
                        .map(|t| parser_utils::get_text(t, source).trim_start_matches(':').trim().to_string())
                        .unwrap_or_else(|| "inferred".to_string());
                    let value_hint = value_node.map(|v| {
                        let text = parser_utils::get_text(v, source);
                        if text.len() > 40 { format!("{}...", &text[..37]) } else { text }
                    });

                    entities.push(GameEntity::Artifact {
                        id, name,
                        artifact_type: if is_const { "constant".into() } else { "variable".into() },
                        datatype, is_mutable: !is_const, value_hint,
                        metadata: make_doc_metadata(comments.clone()),
                    });
                }
            }

            "public_field_definition" | "field_definition" => {
                let name = child
                    .child_by_field_name("name")
                    .or(child.child_by_field_name("property"))
                    .map(|n| parser_utils::get_text(n, source))
                    .unwrap_or_else(|| "field".into());
                let id = format!("{parent_id}::{name}");
                let datatype = child
                    .child_by_field_name("type")
                    .map(|t| parser_utils::get_text(t, source).trim_start_matches(':').trim().to_string())
                    .unwrap_or_else(|| "any".to_string());

                entities.push(GameEntity::Artifact {
                    id, name, artifact_type: "field".to_string(), datatype,
                    is_mutable: true, value_hint: None, metadata: make_doc_metadata(comments),
                });
            }

            "enum_member" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| parser_utils::get_text(n, source))
                    .unwrap_or_else(|| "member".into());
                let id = format!("{parent_id}::{name}");
                entities.push(GameEntity::Artifact {
                    id, name, artifact_type: "enum_value".to_string(),
                    datatype: "enum".to_string(), is_mutable: false, value_hint: None,
                    metadata: make_doc_metadata(comments),
                });
            }

            "statement_block" | "export_statement" => {
                entities.extend(parse_node(child, source, parent_id, imports));
            }
            _ => {
                if !matches!(kind, "class_declaration" | "function_declaration" | "interface_declaration" | "lexical_declaration")
                    && child.child_count() > 0
                {
                    entities.extend(parse_node(child, source, parent_id, imports));
                }
            }
        }
    }
    entities
}
