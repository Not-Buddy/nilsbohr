use crate::db::models::{GitHubRepoMetadata, GitHubRepoResponse, GitHubRefResponse};
use crate::error::AppError;
use tracing::{info, warn};

const GITHUB_API_BASE: &str = "https://api.github.com";

pub async fn fetch_repo_metadata(
    http_client: &reqwest::Client,
    owner: &str,
    repo_name: &str,
    github_token: Option<&str>,
) -> Result<(GitHubRepoMetadata, String), AppError> {
    let url = format!("{GITHUB_API_BASE}/repos/{owner}/{repo_name}");

    let mut request = http_client
        .get(&url)
        .header("User-Agent", "nilsbohr")
        .header("Accept", "application/vnd.github.v3+json");

    if let Some(token) = github_token {
        request = request.header("Authorization", format!("Bearer {token}"));
    }

    let response = request
        .send()
        .await
        .map_err(|e| AppError::ExternalApi(format!("GitHub API request failed: {e}")))?;

    if !response.status().is_success() {
        return Err(AppError::ExternalApi(format!(
            "GitHub API returned {}: {}",
            response.status(),
            response.text().await.unwrap_or_default()
        )));
    }

    let repo_info: GitHubRepoResponse = response
        .json()
        .await
        .map_err(|e| AppError::ExternalApi(format!("Failed to parse GitHub response: {e}")))?;

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

    info!("Fetched GitHub metadata for {owner}/{repo_name}");
    Ok((metadata, default_branch))
}

pub async fn fetch_latest_commit_hash(
    http_client: &reqwest::Client,
    owner: &str,
    repo_name: &str,
    branch: &str,
    github_token: Option<&str>,
) -> Result<String, AppError> {
    let url = format!("{GITHUB_API_BASE}/repos/{owner}/{repo_name}/git/refs/heads/{branch}");

    let mut request = http_client
        .get(&url)
        .header("User-Agent", "nilsbohr")
        .header("Accept", "application/vnd.github.v3+json");

    if let Some(token) = github_token {
        request = request.header("Authorization", format!("Bearer {token}"));
    }

    let response = request
        .send()
        .await
        .map_err(|e| AppError::ExternalApi(format!("GitHub refs API request failed: {e}")))?;

    if !response.status().is_success() {
        warn!(
            "Could not fetch ref for {owner}/{repo_name} branch {branch}: {}",
            response.status()
        );
        return Err(AppError::ExternalApi(format!(
            "Failed to fetch ref: {}",
            response.status()
        )));
    }

    let ref_data: GitHubRefResponse = response
        .json()
        .await
        .map_err(|e| AppError::ExternalApi(format!("Failed to parse ref response: {e}")))?;

    Ok(ref_data.object.sha)
}

pub async fn fetch_user_repos(
    http_client: &reqwest::Client,
    github_token: &str,
    sort: &str,
    direction: &str,
    per_page: &str,
    repo_type: &str,
) -> Result<Vec<serde_json::Value>, AppError> {
    let resp = http_client
        .get(format!("{GITHUB_API_BASE}/user/repos"))
        .query(&[
            ("sort", sort),
            ("direction", direction),
            ("per_page", per_page),
            ("type", repo_type),
        ])
        .header("Authorization", format!("Bearer {github_token}"))
        .header("User-Agent", "nilsbohr-backend")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| AppError::ExternalApi(format!("Failed to fetch repos from GitHub: {e}")))?;

    if !resp.status().is_success() {
        let status = resp.status();
        return Err(AppError::ExternalApi(format!(
            "GitHub API error: {status}"
        )));
    }

    let repos: Vec<serde_json::Value> = resp
        .json()
        .await
        .map_err(|e| AppError::ExternalApi(format!("Failed to parse repos: {e}")))?;

    Ok(repos)
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
