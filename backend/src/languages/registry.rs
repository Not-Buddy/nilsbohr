use crate::models::GameEntity;
use super::traits::LanguageParser;

macro_rules! language_registry {
    ($($ext:expr => $parser:ty),* $(,)?) => {
        pub fn parse_by_extension(
            ext: &str,
            source: &str,
            parent_id: &str,
        ) -> Option<(Vec<GameEntity>, Vec<String>)> {
            match ext {
                $($ext => Some(<$parser>::parse(source, parent_id)),)*
                _ => None,
            }
        }
    };
}

language_registry! {
    "rs"   => RustParser,
    "ts"   => TypeScriptParser,
    "tsx"  => TypeScriptParser,
    "js"   => JavaScriptParser,
    "jsx"  => JavaScriptParser,
    "py"   => PythonParser,
    "cpp"  => CppParser,
    "cc"   => CppParser,
    "cxx"  => CppParser,
    "hpp"  => CppParser,
    "c"    => CParser,
    "h"    => CParser,
    "java" => JavaParser,
}

// Declare all parser structs — each lives in its own module.
// The struct names must match those used in the macro above.
pub struct RustParser;
pub struct TypeScriptParser;
pub struct JavaScriptParser;
pub struct PythonParser;
pub struct CppParser;
pub struct CParser;
pub struct JavaParser;
