use serde::{Deserialize, Serialize};

/// Full user profile stored in Redis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub github_id: i64,
    pub username: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
    pub created_at: String,
    pub last_login: String,
}

/// Lightweight authenticated user extracted by middleware.
/// Injected into handlers that require auth.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub github_id: i64,
    pub username: String,
    pub session_id: String,
}

/// JWT claims payload.
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // github_id as string
    pub username: String,
    pub session_id: String,
    pub exp: usize, // expiry (unix timestamp)
    pub iat: usize, // issued at (unix timestamp)
}

/// GitHub user profile response (subset of fields we care about).
#[derive(Debug, Deserialize)]
pub struct GitHubUser {
    pub id: i64,
    pub login: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
}

/// GitHub OAuth token exchange response.
#[derive(Debug, Deserialize)]
pub struct GitHubTokenResponse {
    pub access_token: String,
    pub token_type: String,
}
