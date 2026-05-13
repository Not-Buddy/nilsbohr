use crate::models::{GameEntity, Parameter};
use super::parser_utils;
use super::traits::LanguageParser;
use super::registry::CParser;

use tracing::{debug, instrument, trace};
use tree_sitter::{Node, Parser};

impl LanguageParser for CParser {
    fn parse(source: &str, parent_id: &str) -> (Vec<GameEntity>, Vec<String>) {
        let mut parser = Parser::new();
        parser
            .set_language(tree_sitter_c::language())
            .expect("Error loading C grammar");

        let tree = parser.parse(source, None).unwrap();
        let mut imports = Vec::new();
        let entities = parse_node(tree.root_node(), source.as_bytes(), parent_id, &mut imports);
        (entities, imports)
    }

    fn extensions() -> &'static [&'static str] {
        &["c", "h"]
    }
}

fn extract_parameters(node: Node, source: &[u8]) -> Vec<Parameter> {
    let mut params = Vec::new();
    if let Some(param_list) = node.child_by_field_name("parameters") {
        let mut cursor = param_list.walk();
        for child in param_list.children(&mut cursor) {
            if child.kind() == "parameter_declaration" {
                let name = child.child_by_field_name("declarator").map(|n| parser_utils::get_text(n, source)).unwrap_or_default();
                if name.is_empty() { continue; }
                let datatype = child.child_by_field_name("type").map(|n| parser_utils::get_text(n, source)).unwrap_or_else(|| "int".to_string());
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
        "printf" | "scanf" | "fprintf" | "fscanf" | "sprintf" | "sscanf" |
        "puts" | "gets" | "putchar" | "getchar" | "malloc" | "calloc" | "realloc" |
        "free" | "sizeof" | "memcpy" | "memmove" | "memset" | "memcmp" |
        "strlen" | "strcpy" | "strncpy" | "strcat" | "strncat" | "strcmp" | "strncmp" |
        "strchr" | "strrchr" | "strstr" | "strtok" | "fopen" | "fclose" | "fread" | "fwrite" |
        "fgets" | "fputs" | "fseek" | "ftell" | "rewind" | "feof" | "ferror" |
        "abs" | "labs" | "llabs" | "fabs" | "sqrt" | "pow" | "sin" | "cos" | "tan" |
        "rand" | "srand" | "atoi" | "atof" | "atol" | "exit" | "abort" | "assert" |
        "qsort" | "bsearch" | "NULL" | "true" | "false" | "bool" | "typeof"
    )
}

const C_COMPLEXITY_KINDS: &[&str] = &[
    "if_statement", "else_clause", "for_statement", "while_statement",
    "do_statement", "switch_statement", "case_statement",
    "conditional_expression", "ternary_expression",
];

#[instrument(skip(node, source, imports), level = "trace")]
fn parse_node(node: Node, source: &[u8], parent_id: &str, imports: &mut Vec<String>) -> Vec<GameEntity> {
    let mut entities = Vec::new();
    let mut cursor = node.walk();

    for child in node.children(&mut cursor) {
        let kind = child.kind();
        match kind {
            "preproc_include" => {
                let text = parser_utils::get_text(child, source);
                let header = text.replace("#include", "").trim_matches(|c: char| c.is_whitespace() || c == '"' || c == '<' || c == '>').to_string();
                if !header.is_empty() { imports.push(header); }
            }

            "struct_specifier" | "union_specifier" | "enum_specifier" => {
                let name = child.child_by_field_name("name").map(|n| parser_utils::get_text(n, source)).unwrap_or_else(|| "Anonymous".into());
                let id = format!("{parent_id}::{name}");
                let loc = parser_utils::count_lines(child);
                let body_node = child.child_by_field_name("body").unwrap_or(child);
                let children = parse_node(body_node, source, &id, imports);
                let building_type = match kind { "enum_specifier" => "enum", "union_specifier" => "union", _ => "struct" };

                debug!(name = %name, kind = "Building", "Found {building_type}");
                entities.push(GameEntity::Building { id, name, building_type: building_type.to_string(), is_public: true, loc, imports: vec![], children, metadata: None });
            }

            "function_definition" | "declaration" => {
                let name = child.child_by_field_name("declarator").map(|n| parser_utils::get_text(n, source)).unwrap_or_else(|| "fn".into());
                let clean_name = name.split('(').next().unwrap_or(&name).trim().to_string();
                if clean_name.is_empty() || clean_name == "{" { continue; }

                let id = format!("{parent_id}::{clean_name}");
                let loc = parser_utils::count_lines(child);
                let parameters = extract_parameters(child, source);
                let return_type = extract_return_type(child, source);
                let complexity = parser_utils::calculate_complexity(child, C_COMPLEXITY_KINDS);

                let body = child.child_by_field_name("body");
                let calls = body.map(|b| parser_utils::extract_function_calls(b, source, "call_expression", is_builtin)).unwrap_or_default();
                let children = body.map(|b| parse_node(b, source, &id, imports)).unwrap_or_default();

                trace!(name = %clean_name, kind = "Room", "Found function");
                entities.push(GameEntity::Room { id, name: clean_name, room_type: "function".to_string(), is_main: false, is_async: false, visibility: "public".to_string(), complexity, loc, parameters, return_type, calls, children, metadata: None });
            }

            "field_declaration" => {
                if let Some(declarator) = child.child_by_field_name("declarator") {
                    let name = parser_utils::get_text(declarator, source);
                    let id = format!("{parent_id}::{name}");
                    let datatype = child.child_by_field_name("type").map(|t| parser_utils::get_text(t, source)).unwrap_or_else(|| "int".to_string());
                    entities.push(GameEntity::Artifact { id, name, artifact_type: "field".to_string(), datatype, is_mutable: true, value_hint: None, metadata: None });
                }
            }

            "enumerator" => {
                let name = child.child_by_field_name("name").map(|n| parser_utils::get_text(n, source)).unwrap_or_else(|| "enumerator".into());
                let id = format!("{parent_id}::{name}");
                entities.push(GameEntity::Artifact { id, name, artifact_type: "enum_value".to_string(), datatype: "enum".to_string(), is_mutable: false, value_hint: None, metadata: None });
            }

            "expression_statement" => {
                let mut expr_cursor = child.walk();
                for expr_child in child.children(&mut expr_cursor) {
                    if expr_child.kind() == "assignment_expression" {
                        if let Some(left) = expr_child.child_by_field_name("left") {
                            let name = parser_utils::get_text(left, source);
                            if !name.contains('.') && !name.is_empty() && !name.contains('[') {
                                let id = format!("{parent_id}::{name}");
                                let value_hint = expr_child.child_by_field_name("right").map(|v| {
                                    let val = parser_utils::get_text(v, source);
                                    if val.len() > 30 { format!("{}...", val.chars().take(27).collect::<String>()) } else { val }
                                });
                                trace!(name = %name, kind = "Artifact", "Found variable");
                                entities.push(GameEntity::Artifact { id, name, artifact_type: "variable".to_string(), datatype: "int".to_string(), is_mutable: true, value_hint, metadata: None });
                            }
                        }
                    }
                }
            }

            _ => {
                if child.child_count() > 0 { entities.extend(parse_node(child, source, parent_id, imports)); }
            }
        }
    }
    entities
}
