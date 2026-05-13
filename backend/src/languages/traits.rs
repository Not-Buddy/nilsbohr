use crate::models::GameEntity;

pub trait LanguageParser {
    fn parse(source: &str, parent_id: &str) -> (Vec<GameEntity>, Vec<String>);
    fn extensions() -> &'static [&'static str];
}
