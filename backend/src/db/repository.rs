use chrono::Utc;
use mongodb::Database;
use mongodb::bson::{doc, oid::ObjectId};
use tracing::{debug, info, warn};

use super::models::{GitHubRefResponse, GitHubRepoMetadata, GitHubRepoResponse, RepoDoc};

const GITHUB_API_BASE: &str = "https://api.github.com";

pub async fn find_or_create_repo(
    db: &Database,
    repo_url: &str,
    project_name: &str,
    owner: &str,
    repo_name: &str,
    github_user_id: &str,
) -> Result<RepoDoc, String> {
    let collection = db.collection::<RepoDoc>("repositories");

    if let Ok(Some(existing)) = collection.find_one(doc! { "repo_url": repo_url }).await {
        debug!("Found existing repository: {}", repo_url);
        return Ok(existing);
    }

    let now = Utc::now().to_rfc3339();
    let repo = RepoDoc {
        id: None,
        github_user_id: github_user_id.to_string(),
        repo_url: repo_url.to_string(),
        project_name: project_name.to_string(),
        owner: owner.to_string(),
        repo_name: repo_name.to_string(),
        default_branch: "main".to_string(),
        latest_commit_hash: None,
        last_parsed_at: None,
        last_updated_at: now.clone(),
        clone_status: "active".to_string(),
        github_metadata: None,
        created_at: now,
    };

    let result = collection.insert_one(&repo).await.map_err(|e| e.to_string())?;
    let inserted_id = result
        .inserted_id
        .as_object_id()
        .ok_or("Failed to get inserted ID")?;

    let mut created = repo;
    created.id = Some(inserted_id);
    info!("Created new repository document: {}", repo_url);
    Ok(created)
}

pub async fn fetch_github_metadata(
    http_client: &reqwest::Client,
    owner: &str,
    repo_name: &str,
    github_token: Option<&str>,
) -> Result<(GitHubRepoMetadata, String), String> {
    let url = format!("{GITHUB_API_BASE}/repos/{owner}/{repo_name}");

    let mut request = http_client
        .get(&url)
        .header("User-Agent", "nilsbohr")
        .header("Accept", "application/vnd.github.v3+json");

    if let Some(token) = github_token {
        request = request.header("Authorization", format!("Bearer {token}"));
    }

    let response = request.send().await.map_err(|e| format!("GitHub API request failed: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "GitHub API returned {}: {}",
            response.status(),
            response.text().await.unwrap_or_default()
        ));
    }

    let repo_info: GitHubRepoResponse =
        response.json().await.map_err(|e| format!("Failed to parse GitHub response: {e}"))?;

    let default_branch = repo_info.default_branch.unwrap_or_else(|| "main".to_string());

    let metadata = GitHubRepoMetadata {
        description: repo_info.description,
        stars: repo_info.stargazers_count,
        language: repo_info.language,
        topics: repo_info.topics,
        fork: repo_info.fork,
        archived: repo_info.archived,
        pushed_at: repo_info.pushed_at,
    };

    Ok((metadata, default_branch))
}

pub async fn fetch_latest_commit_hash(
    http_client: &reqwest::Client,
    owner: &str,
    repo_name: &str,
    branch: &str,
    github_token: Option<&str>,
) -> Result<String, String> {
    let url = format!("{GITHUB_API_BASE}/repos/{owner}/{repo_name}/git/refs/heads/{branch}");

    let mut request = http_client
        .get(&url)
        .header("User-Agent", "nilsbohr")
        .header("Accept", "application/vnd.github.v3+json");

    if let Some(token) = github_token {
        request = request.header("Authorization", format!("Bearer {token}"));
    }

    let response = request.send().await.map_err(|e| format!("GitHub refs API request failed: {e}"))?;

    if !response.status().is_success() {
        warn!("Could not fetch ref for {}/{} branch {}: {}", owner, repo_name, branch, response.status());
        return Err(format!("Failed to fetch ref: {}", response.status()));
    }

    let ref_data: GitHubRefResponse =
        response.json().await.map_err(|e| format!("Failed to parse ref response: {e}"))?;

    Ok(ref_data.object.sha)
}

pub async fn update_repo_after_parse(
    db: &Database,
    repo_id: ObjectId,
    latest_commit_hash: &str,
    default_branch: &str,
    metadata: Option<GitHubRepoMetadata>,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let collection = db.collection::<RepoDoc>("repositories");

    let mut update_doc = doc! {
        "latest_commit_hash": latest_commit_hash,
        "default_branch": default_branch,
        "last_parsed_at": &now,
        "last_updated_at": &now,
    };

    if let Some(m) = metadata {
        let bson_meta = mongodb::bson::to_bson(&m).map_err(|e| e.to_string())?;
        update_doc.insert("github_metadata", bson_meta);
    }

    collection
        .update_one(doc! { "_id": repo_id }, doc! { "$set": update_doc })
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn parse_github_url(url: &str) -> Option<(String, String)> {
    let cleaned = url.trim_end_matches('/').trim_end_matches(".git");

    let path = if let Some(pos) = cleaned.find("github.com/") {
        &cleaned[pos + "github.com/".len()..]
    } else if !cleaned.contains("://") && !cleaned.contains('/') {
        return None;
    } else {
        let parts: Vec<&str> = cleaned.split('/').collect();
        if parts.len() >= 2 {
            let last = parts[parts.len() - 1];
            let second_last = parts[parts.len() - 2];
            if last.contains('.') {
                return Some((second_last.to_string(), last.split('.').next()?.to_string()));
            }
            return Some((second_last.to_string(), last.to_string()));
        }
        return None;
    };

    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if segments.len() >= 2 {
        Some((segments[0].to_string(), segments[1].to_string()))
    } else {
        None
    }
}

pub async fn find_repo_by_commit(
    db: &Database,
    repo_url: &str,
) -> Result<Option<RepoDoc>, String> {
    let collection = db.collection::<RepoDoc>("repositories");
    collection
        .find_one(doc! { "repo_url": repo_url })
        .await
        .map_err(|e| e.to_string())
}
