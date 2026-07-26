use reqwest::Client;
use serde::Deserialize;
use tracing::info;

use super::super::config::AuthConfig;

/// Build the Google OAuth authorization URL.
pub fn build_google_authorize_url(config: &AuthConfig) -> String {
    format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email%20profile",
        config.google_client_id,
        format!("{}/auth/google/callback", config.frontend_url),
    )
}

/// Exchange an authorization code for a Google access token.
pub async fn exchange_google_code(
    http: &Client,
    config: &AuthConfig,
    code: &str,
) -> Result<String, String> {
    let redirect_uri = format!("{}/auth/google/callback", config.frontend_url);

    let resp = http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code),
            ("client_id", &config.google_client_id),
            ("client_secret", &config.google_client_secret),
            ("redirect_uri", &redirect_uri),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .map_err(|e| format!("Google token exchange request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Google token exchange failed ({}): {}",
            status, body
        ));
    }

    let token_resp: GoogleTokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Google token response: {}", e))?;

    info!("Google token exchange successful");
    Ok(token_resp.access_token)
}

/// Fetch the authenticated user's profile from Google using an access token.
pub async fn fetch_google_user(http: &Client, access_token: &str) -> Result<GoogleUser, String> {
    let resp = http
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .header("Authorization", format!("Bearer {}", access_token))
        .send()
        .await
        .map_err(|e| format!("Google user fetch failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "Google user fetch failed ({}): {}",
            status, body
        ));
    }

    let user: GoogleUser = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Google user response: {}", e))?;

    info!(sub = %user.sub, name = %user.name, "Fetched Google user profile");
    Ok(user)
}

#[derive(Debug, Deserialize)]
pub struct GoogleTokenResponse {
    pub access_token: String,
    pub id_token: Option<String>,
    pub expires_in: u64,
    pub token_type: String,
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GoogleUser {
    pub sub: String,
    pub name: String,
    pub email: Option<String>,
    pub picture: Option<String>,
}
