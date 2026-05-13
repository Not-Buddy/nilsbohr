use reqwest::Client;
use tracing::info;

use super::config::AuthConfig;
use super::models::{GitHubTokenResponse, GitHubUser};

/// Build the GitHub OAuth authorization URL that the user's browser is redirected to.
pub fn build_authorize_url(config: &AuthConfig) -> String {
    format!(
        "https://github.com/login/oauth/authorize?client_id={}&scope=read:user%20user:email",
        config.github_client_id
    )
}

/// Exchange an authorization code for a GitHub access token.
pub async fn exchange_code(
    http: &Client,
    config: &AuthConfig,
    code: &str,
) -> Result<String, String> {
    let resp = http
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "client_id": config.github_client_id,
            "client_secret": config.github_client_secret,
            "code": code,
        }))
        .send()
        .await
        .map_err(|e| format!("GitHub token exchange request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "GitHub token exchange failed ({}): {}",
            status, body
        ));
    }

    let token_resp: GitHubTokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub token response: {}", e))?;

    info!("GitHub token exchange successful");
    Ok(token_resp.access_token)
}

/// Fetch the authenticated user's profile from GitHub.
pub async fn fetch_github_user(http: &Client, access_token: &str) -> Result<GitHubUser, String> {
    let resp = http
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "nilsbohr-backend")
        .send()
        .await
        .map_err(|e| format!("GitHub user fetch failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("GitHub user fetch failed ({}): {}", status, body));
    }

    let user: GitHubUser = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub user response: {}", e))?;

    info!(github_id = user.id, login = %user.login, "Fetched GitHub user profile");
    Ok(user)
}
