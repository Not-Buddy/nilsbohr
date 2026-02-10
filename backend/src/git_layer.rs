use chrono::{TimeZone, Utc};
use git2::{BlameOptions, Repository};
use std::collections::HashMap;
use std::path::Path;

pub struct GitLayer {
    repo: Option<Repository>,
}

impl GitLayer {
    pub fn new(repo_path: &Path) -> Self {
        // Use open instead of discover if we know it's the root, for performance.
        // Fallback to discover if open fails (maybe not effectively root?)
        let repo = match Repository::open(repo_path) {
            Ok(r) => Some(r),
            Err(_) => match Repository::discover(repo_path) {
                Ok(r) => Some(r),
                Err(e) => {
                    tracing::warn!("Failed to open git repository at {:?}: {}", repo_path, e);
                    None
                }
            },
        };
        Self { repo }
    }

    pub fn get_file_metadata(&self, file_path: &Path) -> Option<HashMap<String, String>> {
        let repo = self.repo.as_ref()?;

        // Convert absolute path to relative path from repo root
        // If file_path is absolute and repo workdir is absolute, this works.
        let workdir = repo.workdir()?;
        let rel_path = if file_path.is_absolute() {
            file_path.strip_prefix(workdir).ok()?
        } else {
            file_path
        };

        let mut metadata = HashMap::new();

        // Use blame to find the most recent commit touching the file
        // We use a simplified blame with no options to use default (which is usually fine)
        let mut opts = BlameOptions::new();

        if let Ok(blame) = repo.blame_file(rel_path, Some(&mut opts)) {
            let mut last_commit_id = None;
            let mut max_time = 0;

            for hunk in blame.iter() {
                let commit_id = hunk.final_commit_id();
                // We need to look up the commit to get the time
                if let Ok(commit) = repo.find_commit(commit_id) {
                    let time = commit.time().seconds();
                    if time > max_time {
                        max_time = time;
                        last_commit_id = Some(commit);
                    }
                }
            }

            if let Some(commit) = last_commit_id {
                let author = commit.author();
                metadata.insert(
                    "author_name".to_string(),
                    author.name().unwrap_or("Unknown").to_string(),
                );
                metadata.insert(
                    "author_email".to_string(),
                    author.email().unwrap_or("").to_string(),
                );

                let message = commit.message().unwrap_or("").trim().to_string();
                metadata.insert("last_commit_message".to_string(), message);

                let time = Utc.timestamp_opt(commit.time().seconds(), 0).unwrap();
                metadata.insert("last_modified".to_string(), time.to_rfc3339());

                metadata.insert("commit_hash".to_string(), commit.id().to_string());
            }
        }

        if metadata.is_empty() {
            None
        } else {
            Some(metadata)
        }
    }
}
