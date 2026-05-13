use crate::models::{GameEntity, Parameter};
use super::parser_utils;
use super::traits::LanguageParser;
use super::registry::JavaParser;

use tracing::{debug, instrument, trace};
use tree_sitter::{Node, Parser};

impl LanguageParser for JavaParser {
    fn parse(source: &str, parent_id: &str) -> (Vec<GameEntity>, Vec<String>) {
        let mut parser = Parser::new();
        parser
            .set_language(tree_sitter_java::language())
            .expect("Error loading Java grammar");

        let tree = parser.parse(source, None).unwrap();
        let mut imports = Vec::new();
        let entities = parse_node(tree.root_node(), source.as_bytes(), parent_id, &mut imports);
        (entities, imports)
    }

    fn extensions() -> &'static [&'static str] {
        &["java"]
    }
}

fn extract_modifiers(node: Node, source: &[u8]) -> (String, bool, bool) {
    let mut visibility = "package".to_string();
    let mut is_static = false;
    let mut is_final = false;

    if let Some(modifiers) = node.child_by_field_name("modifiers") {
        let text = parser_utils::get_text(modifiers, source);
        if text.contains("public") { visibility = "public".to_string(); }
        else if text.contains("private") { visibility = "private".to_string(); }
        else if text.contains("protected") { visibility = "protected".to_string(); }
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
                let name = child.child_by_field_name("name").map(|n| parser_utils::get_text(n, source)).unwrap_or_default();
                if name.is_empty() { continue; }
                let datatype = child.child_by_field_name("type").map(|n| parser_utils::get_text(n, source)).unwrap_or_else(|| "Object".to_string());
                params.push(Parameter { name, datatype });
            }
        }
    }
    params
}

fn extract_return_type(node: Node, source: &[u8]) -> Option<String> {
    node.child_by_field_name("type").map(|n| parser_utils::get_text(n, source))
}

fn is_builtin(name: &str) -> bool {
    matches!(name,
        "System" | "out" | "println" | "print" | "printf" | "err" |
        "String" | "Integer" | "Long" | "Double" | "Float" | "Boolean" | "Character" | "Byte" | "Short" | "Object" |
        "equals" | "hashCode" | "toString" | "clone" | "getClass" | "notify" | "notifyAll" | "wait" |
        "length" | "charAt" | "substring" | "indexOf" | "lastIndexOf" | "startsWith" | "endsWith" |
        "contains" | "replace" | "replaceAll" | "trim" | "toLowerCase" | "toUpperCase" |
        "split" | "matches" | "valueOf" | "parseInt" | "parseLong" | "parseDouble" |
        "add" | "get" | "set" | "remove" | "size" | "isEmpty" | "clear" |
        "put" | "entrySet" | "keySet" | "values" | "forEach" | "stream" | "collect" |
        "filter" | "map" | "reduce" | "findFirst" | "orElse" | "orElseGet" |
        "of" | "newInstance" | "forName" | "getName" | "getSimpleName" |
        "main" | "args" | "null" | "true" | "false" | "this" | "super" | "new"
    )
}

const JAVA_COMPLEXITY_KINDS: &[&str] = &[
    "if_statement", "else_clause", "for_statement", "enhanced_for_statement",
    "while_statement", "do_statement", "switch_statement", "switch_label",
    "catch_clause", "try_with_resources_statement", "conditional_expression",
    "finally_clause",
];

#[instrument(skip(node, source, imports), level = "trace")]
fn parse_node(node: Node, source: &[u8], parent_id: &str, imports: &mut Vec<String>) -> Vec<GameEntity> {
    let mut entities = Vec::new();
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        let kind = child.kind();
        match kind {
            "import_declaration" => {
                let text = parser_utils::get_text(child, source);
                let cleaned = text.replace("import", "").replace("static", "").trim_end_matches(';').trim().to_string();
                if !cleaned.is_empty() {
                    imports.push(format!("{}.java", cleaned.replace('.', "/")));
                }
            }

            "class_declaration" | "interface_declaration" | "enum_declaration" | "annotation_type_declaration" => {
                let name = child.child_by_field_name("name").map(|n| parser_utils::get_text(n, source)).unwrap_or_else(|| "Anonymous".into());
                let id = format!("{parent_id}::{name}");
                let (visibility, _, _) = extract_modifiers(child, source);
                let is_public = visibility == "public";
                let loc = parser_utils::count_lines(child);
                let body_node = child.child_by_field_name("body").unwrap_or(child);
                let children = parse_node(body_node, source, &id, imports);
                let building_type = match kind { "interface_declaration" => "interface", "enum_declaration" => "enum", "annotation_type_declaration" => "annotation", _ => "class" };

                debug!(name = %name, kind = "Building", "Found {building_type}");
                entities.push(GameEntity::Building { id, name, building_type: building_type.to_string(), is_public, loc, imports: vec![], children, metadata: None });
            }

            "method_declaration" | "constructor_declaration" => {
                let name = child.child_by_field_name("name").map(|n| parser_utils::get_text(n, source)).unwrap_or_else(|| if kind == "constructor_declaration" { "<init>".into() } else { "method".into() });
                let id = format!("{parent_id}::{name}");
                let (visibility, _, _) = extract_modifiers(child, source);
                let loc = parser_utils::count_lines(child);
                let parameters = extract_parameters(child, source);
                let return_type = if kind == "constructor_declaration" { None } else { extract_return_type(child, source) };
                let complexity = parser_utils::calculate_complexity(child, JAVA_COMPLEXITY_KINDS);

                let body = child.child_by_field_name("body");
                let calls = body.map(|b| parser_utils::extract_function_calls(b, source, "method_invocation", is_builtin)).unwrap_or_default();
                let children = body.map(|b| parse_node(b, source, &id, imports)).unwrap_or_default();
                let room_type = if kind == "constructor_declaration" { "constructor" } else { "method" };

                trace!(name = %name, kind = "Room", "Found {room_type}");
                entities.push(GameEntity::Room { id, name, room_type: room_type.to_string(), is_main: false, is_async: false, visibility: visibility.to_string(), complexity, loc, parameters, return_type, calls, children, metadata: None });
            }

            "field_declaration" => {
                let mut field_cursor = child.walk();
                for field_child in child.children(&mut field_cursor) {
                    if field_child.kind() == "variable_declarator" {
                        let name = field_child.child_by_field_name("name").map(|n| parser_utils::get_text(n, source)).unwrap_or_default();
                        if name.is_empty() { continue; }
                        let id = format!("{parent_id}::{name}");
                        let (_visibility, is_static, is_final) = extract_modifiers(child, source);
                        let datatype = child.child_by_field_name("type").map(|t| parser_utils::get_text(t, source)).unwrap_or_else(|| "Object".to_string());

                        let value_hint = field_child.child_by_field_name("value").map(|v| {
                            let val = parser_utils::get_text(v, source);
                            if val.len() > 30 { format!("{}...", val.chars().take(27).collect::<String>()) } else { val }
                        });

                        let artifact_type = if is_final { "constant" } else { "field" };
                        let mut metadata = None;
                        if is_static { let mut m = std::collections::HashMap::new(); m.insert("static".into(), "true".into()); metadata = Some(m); }

                        entities.push(GameEntity::Artifact { id, name, artifact_type: artifact_type.to_string(), datatype, is_mutable: !is_final, value_hint, metadata });
                    }
                }
            }

            "enum_constant" => {
                let name = child.child_by_field_name("name").map(|n| parser_utils::get_text(n, source)).unwrap_or_else(|| "constant".into());
                let id = format!("{parent_id}::{name}");
                entities.push(GameEntity::Artifact { id, name, artifact_type: "enum_value".to_string(), datatype: "enum".to_string(), is_mutable: false, value_hint: None, metadata: None });
            }

            _ => {
                if child.child_count() > 0 { entities.extend(parse_node(child, source, parent_id, imports)); }
            }
        }
    }
    entities
}
