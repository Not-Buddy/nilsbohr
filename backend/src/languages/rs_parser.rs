use crate::models::{GameEntity, Parameter};
use super::parser_utils;

use super::traits::LanguageParser;
use super::registry::RustParser;

use tracing::instrument;
use tree_sitter::{Node, Parser};

impl LanguageParser for RustParser {
    fn parse(source: &str, parent_id: &str) -> (Vec<GameEntity>, Vec<String>) {
        let mut parser = Parser::new();
        parser
            .set_language(tree_sitter_rust::language())
            .expect("Error loading Rust grammar");

        let tree = parser.parse(source, None).unwrap();
        let mut imports = Vec::new();
        let entities = parse_rust_node(tree.root_node(), source.as_bytes(), parent_id, &mut imports);
        (entities, imports)
    }

    fn extensions() -> &'static [&'static str] {
        &["rs"]
    }
}

fn is_public(node: Node, source: &[u8]) -> bool {
    node.children(&mut node.walk()).any(|child| {
        child.kind() == "visibility_modifier"
            && parser_utils::get_text(child, source).starts_with("pub")
    })
}

fn is_async(node: Node, source: &[u8]) -> bool {
    node.children(&mut node.walk())
        .any(|child| child.kind() == "async")
        || parser_utils::get_text(node, source).contains("async fn")
}

fn extract_parameters(node: Node, source: &[u8]) -> Vec<Parameter> {
    let mut params = Vec::new();
    if let Some(param_list) = node.child_by_field_name("parameters") {
        let mut cursor = param_list.walk();
        for child in param_list.children(&mut cursor) {
            if child.kind() == "parameter" {
                let name = child
                    .child_by_field_name("pattern")
                    .map(|n| parser_utils::get_text(n, source))
                    .unwrap_or_default();
                let datatype = child
                    .child_by_field_name("type")
                    .map(|n| parser_utils::get_text(n, source))
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
        .map(|n| parser_utils::get_text(n, source).trim_start_matches("-> ").to_string())
}

fn is_builtin(name: &str) -> bool {
    matches!(
        name,
        "println" | "print" | "eprintln" | "eprint" | "format" | "write" | "writeln" |
        "panic" | "todo" | "unimplemented" | "unreachable" |
        "assert" | "assert_eq" | "assert_ne" | "debug_assert" | "debug_assert_eq" |
        "dbg" | "vec" | "include_str" | "include_bytes" | "env" |
        "new" | "default" | "from" | "into" | "try_from" | "try_into" |
        "clone" | "to_string" | "to_owned" | "as_ref" | "as_mut" | "deref" |
        "as_str" | "as_bytes" | "into_inner" |
        "Some" | "None" | "Ok" | "Err" |
        "unwrap" | "expect" | "unwrap_or" | "unwrap_or_else" | "unwrap_or_default" |
        "is_some" | "is_none" | "is_ok" | "is_err" | "ok" | "err" | "map_err" |
        "transpose" | "and_then" | "or_else" |
        "iter" | "iter_mut" | "into_iter" | "collect" |
        "map" | "filter" | "reduce" | "fold" | "for_each" | "inspect" |
        "find" | "any" | "all" | "enumerate" | "zip" | "chain" | "take" | "skip" |
        "flat_map" | "flatten" | "cycle" | "peekable" |
        "push" | "pop" | "insert" | "remove" | "get" | "get_mut" |
        "len" | "is_empty" | "contains" | "clear" | "sort" | "sort_by" |
        "trim" | "split" | "lines" | "chars" | "bytes" |
        "replace" | "starts_with" | "ends_with" | "to_lowercase" | "to_uppercase" |
        "lock" | "read" | "await" | "spawn" | "block_on"
    )
    || name.starts_with("std::")
    || name.starts_with("core::")
    || matches!(name, "Vec" | "String" | "Option" | "Result" | "Box" | "Rc" | "Arc" | "Mutex" | "RwLock")
}

const RS_COMPLEXITY_KINDS: &[&str] = &[
    "if_expression", "match_expression", "while_expression", "for_expression",
    "loop_expression", "?", "match_arm",
];

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
            "use_declaration" => {
                let import_path = parser_utils::get_text(child, source)
                    .trim_start_matches("use ")
                    .trim_end_matches(';')
                    .to_string();
                if import_path.starts_with("crate::") {
                    let path = import_path.replace("crate::", "src/").replace("::", "/");
                    imports.push(format!("{}.rs", path));
                }
            }

            "struct_item" | "enum_item" | "trait_item" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| parser_utils::get_text(n, source))
                    .unwrap_or_else(|| "Anonymous".into());

                let id = format!("{parent_id}::{name}");
                let children = parse_rust_node(child, source, &id, imports);
                let loc = parser_utils::count_lines(child);

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

            "impl_item" => {
                let trait_node = child.child_by_field_name("trait");
                let self_type_node = child.child_by_field_name("type");

                let name = if let Some(trait_node) = trait_node {
                    let trait_name = parser_utils::get_text(trait_node, source);
                    let self_type_name = self_type_node
                        .map(|n| parser_utils::get_text(n, source))
                        .unwrap_or_else(|| "unknown".into());
                    format!("impl {trait_name} for {self_type_name}")
                } else if let Some(self_type_node) = self_type_node {
                    let self_type_name = parser_utils::get_text(self_type_node, source);
                    format!("impl {self_type_name}")
                } else {
                    "impl unknown".to_string()
                };

                let id = format!(
                    "{parent_id}::{}",
                    name.replace(' ', "_").replace(['<', '>', ':'], "_")
                );
                let children = parse_rust_node(child, source, &id, imports);
                let loc = parser_utils::count_lines(child);

                entities.push(GameEntity::Building {
                    id,
                    name,
                    building_type: "impl".to_string(),
                    is_public: false,
                    loc,
                    imports: vec![],
                    children,
                    metadata: None,
                });
            }

            "function_item" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| parser_utils::get_text(n, source))
                    .unwrap_or_else(|| "fn".into());

                let id = format!("{parent_id}::{name}");
                let is_main = name == "main";
                let loc = parser_utils::count_lines(child);
                let parameters = extract_parameters(child, source);
                let return_type = extract_return_type(child, source);
                let is_async_fn = is_async(child, source);
                let visibility = if is_public(child, source) { "public" } else { "private" };

                let calls = child
                    .child_by_field_name("body")
                    .map(|body| {
                        parser_utils::extract_function_calls(body, source, "call_expression", is_builtin)
                    })
                    .unwrap_or_default();

                let mut contents = Vec::new();
                if let Some(body) = child.child_by_field_name("body") {
                    contents.extend(parse_rust_node(body, source, &id, imports));
                }

                let complexity =
                    parser_utils::calculate_complexity(child, RS_COMPLEXITY_KINDS);

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

            "let_declaration" | "const_item" | "static_item" => {
                let name_node = child
                    .child_by_field_name("pattern")
                    .or_else(|| child.child_by_field_name("name"));

                let type_node = child.child_by_field_name("type");
                let value_node = child.child_by_field_name("value");

                if let Some(n) = name_node {
                    let name = parser_utils::get_text(n, source);
                    let datatype = type_node
                        .map(|t| parser_utils::get_text(t, source))
                        .unwrap_or_else(|| "inferred".into());
                    let id = format!("{parent_id}::{name}");
                    let text = parser_utils::get_text(child, source);
                    let is_mutable = text.contains("mut");

                    let artifact_type = match kind {
                        "const_item" => "constant",
                        "static_item" => "static",
                        _ => "variable",
                    };

                    let value_hint = value_node.map(|v| {
                        let val = parser_utils::get_text(v, source);
                        if val.len() > 30 {
                            format!("{}...", val.chars().take(27).collect::<String>())
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

            "field_declaration" => {
                let name = child
                    .child_by_field_name("name")
                    .map(|n| parser_utils::get_text(n, source))
                    .unwrap_or_default();
                let datatype = child
                    .child_by_field_name("type")
                    .map(|t| parser_utils::get_text(t, source))
                    .unwrap_or_else(|| "unknown".into());

                if !name.is_empty() {
                    let id = format!("{parent_id}::{name}");
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

        impl Greet for Person {
            fn greet(&self) -> String {
                format!("Hello, my name is {}", self.name)
            }
        }
        "#;

        let (entities, _imports) = RustParser::parse(source_code, "test_file");

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
