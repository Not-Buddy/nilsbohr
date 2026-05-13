use std::fs;
use std::path::{Path, PathBuf};

pub fn collect_file_paths(dir: &Path, results: &mut Vec<PathBuf>) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();

            let is_supported_file = !path.is_dir() && {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    matches!(
                        ext,
                        "rs" | "ts" | "tsx" | "js" | "jsx" | "py"
                            | "cpp" | "cc" | "cxx" | "hpp" | "c" | "h"
                            | "java"
                    )
                } else {
                    false
                }
            };

            if !is_supported_file
                && path
                    .file_name()
                    .map(|s| s.to_string_lossy().starts_with('.'))
                    .unwrap_or(false)
            {
                continue;
            }

            let skip_dirs = [
                "node_modules", "target", "dist", "build",
                "__pycache__", ".git", "vendor",
            ];
            if path.is_dir() {
                if let Some(name) = path.file_name()
                    && skip_dirs.contains(&name.to_string_lossy().as_ref())
                {
                    continue;
                }
                collect_file_paths(&path, results);
            } else if is_supported_file {
                results.push(path);
            }
        }
    }
}
