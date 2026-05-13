use tree_sitter::Node;

pub fn get_text<'a>(node: Node<'a>, source: &'a [u8]) -> String {
    node.utf8_text(source).unwrap_or("").to_string()
}

pub fn count_lines(node: Node) -> u32 {
    let start = node.start_position().row;
    let end = node.end_position().row;
    (end - start + 1) as u32
}

pub fn calculate_complexity(node: Node, complexity_kinds: &[&str]) -> u32 {
    let mut complexity = 1;
    count_complexity_nodes(node, complexity_kinds, &mut complexity);
    complexity
}

fn count_complexity_nodes(node: Node, complexity_kinds: &[&str], complexity: &mut u32) {
    if complexity_kinds.contains(&node.kind()) {
        *complexity += 1;
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        count_complexity_nodes(child, complexity_kinds, complexity);
    }
}

pub fn extract_function_calls(
    node: Node,
    source: &[u8],
    call_kind: &str,
    is_builtin_fn: fn(&str) -> bool,
) -> Vec<String> {
    let mut calls = Vec::new();
    extract_calls_recursive_with_name(node, source, call_kind, &mut calls);
    calls
        .into_iter()
        .filter(|c| !c.is_empty() && !is_builtin_fn(c))
        .collect()
}

fn extract_calls_recursive_with_name(
    node: Node,
    source: &[u8],
    call_kind: &str,
    calls: &mut Vec<String>,
) {
    if node.kind() == call_kind {
        if let Some(name) = extract_call_name(node, source) {
            if !name.is_empty() {
                calls.push(name);
            }
        }
    }

    let mut cursor = node.walk();
    for child in node.children(&mut cursor) {
        extract_calls_recursive_with_name(child, source, call_kind, calls);
    }
}

#[allow(clippy::collapsible_match)]
fn extract_call_name(node: Node, source: &[u8]) -> Option<String> {
    match node.kind() {
        "call_expression" => node
            .child_by_field_name("function")
            .map(|n| clean_call_name(&get_text(n, source))),
        "call" => node
            .child_by_field_name("function")
            .map(|n| clean_dotted_name(&get_text(n, source))),
        "method_invocation" => node
            .child_by_field_name("name")
            .map(|n| get_text(n, source)),
        _ => None,
    }
}

fn clean_call_name(raw: &str) -> String {
    raw.split("::")
        .last()
        .unwrap_or(raw)
        .split('.')
        .next_back()
        .unwrap_or(raw)
        .to_string()
}

fn clean_dotted_name(raw: &str) -> String {
    raw.split('.').next_back().unwrap_or(raw).to_string()
}
