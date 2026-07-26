use chrono::{TimeZone, Utc};
use git2::{FetchOptions, Repository};
use std::collections::HashMap;
use std::path::Path;

pub struct GitLayer {
    repo: Option<Repository>,
}

impl GitLayer {
    pub fn new(repo_path: &Path) -> Self {
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

    /// Performs a shallow (depth=1) clone of a repository.
    pub fn shallow_clone(url: &str, dest: &Path) -> Result<Repository, git2::Error> {
        let mut fetch_options = FetchOptions::new();
        fetch_options.depth(1);
        fetch_options.download_tags(git2::AutotagOption::None);

        let mut builder = git2::build::RepoBuilder::new();
        builder.fetch_options(fetch_options);
        builder.clone(url, dest)
    }

    /// Returns metadata for the tip commit (the only commit after a shallow clone).
    /// Used instead of per-file blame since shallow clones have no history.
    pub fn get_tip_metadata(&self) -> Option<HashMap<String, String>> {
        let repo = self.repo.as_ref()?;

        let head = repo.head().ok()?;
        let commit = head.peel_to_commit().ok()?;

        let mut metadata = HashMap::new();
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

        Some(metadata)
    }

    pub fn get_file_metadata(&self, _file_path: &Path) -> Option<HashMap<String, String>> {
        self.get_tip_metadata()
    }
}
