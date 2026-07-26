use chrono::Utc;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{error, info};
use uuid::Uuid;

use crate::auth::AuthConfig;
use crate::auth::models::{AuthUser, Claims, User};
use crate::auth::{jwt, redis as auth_redis};
use crate::error::AppError;
use crate::services::github_service;
use crate::state::AppState;

pub fn build_login_url(config: &AuthConfig) -> String {
    crate::auth::oauth::github::build_authorize_url(config, &config.frontend_url)
}

pub struct LoginResult {
    pub token: String,
    pub session_id: String,
    pub user: User,
    pub cookie_value: String,
    pub redirect_url: String,
}

pub async fn handle_callback(
    state: &AppState,
    code: &str,
) -> Result<LoginResult, AppError> {
    let access_token = crate::auth::oauth::github::exchange_code(&state.http, &state.config, code)
        .await
        .map_err(|e| {
            error!("GitHub OAuth code exchange failed: {}", e);
            AppError::Unauthorized(e)
        })?;

    let gh_user = crate::auth::oauth::github::fetch_github_user(&state.http, &access_token)
        .await
        .map_err(|e| {
            error!("GitHub user fetch failed: {}", e);
            AppError::ExternalApi(e)
        })?;

    // Upsert user in MySQL
    let _db_user = crate::db::mysql::users::find_or_create_oauth_user(
        &state.mysql,
        "github",
        &gh_user.id.to_string(),
        gh_user.email.as_deref(),
        &gh_user.login,
        gh_user.avatar_url.as_deref(),
    )
    .await?;

    let now = Utc::now().to_rfc3339();
    let existing = auth_redis::get_user(&state.redis, gh_user.id)
        .await
        .map_err(|e| AppError::Internal(e))?
        .unwrap_or_else(|| User {
            github_id: gh_user.id,
            username: gh_user.login.clone(),
            display_name: None,
            email: None,
            avatar_url: None,
            created_at: now.clone(),
            last_login: now.clone(),
        });

    let user = User {
        github_id: gh_user.id,
        username: gh_user.login.clone(),
        display_name: gh_user.name,
        email: gh_user.email,
        avatar_url: gh_user.avatar_url,
        created_at: existing.created_at,
        last_login: now,
    };

    auth_redis::store_user(&state.redis, &user)
        .await
        .map_err(|e| {
            error!("Failed to store user: {}", e);
            AppError::Internal(e)
        })?;

    auth_redis::store_github_token(&state.redis, user.github_id, &access_token)
        .await
        .map_err(|e| {
            error!("Failed to store GitHub token: {}", e);
            AppError::Internal(e)
        })?;

    issue_session(state, user).await
}

pub async fn handle_google_callback(
    state: &AppState,
    code: &str,
) -> Result<LoginResult, AppError> {
    let access_token =
        crate::auth::oauth::google::exchange_google_code(&state.http, &state.config, code)
            .await
            .map_err(|e| {
                error!("Google OAuth code exchange failed: {}", e);
                AppError::Unauthorized(e)
            })?;

    let google_user =
        crate::auth::oauth::google::fetch_google_user(&state.http, &access_token)
            .await
            .map_err(|e| {
                error!("Google user fetch failed: {}", e);
                AppError::ExternalApi(e)
            })?;

    // Upsert user in MySQL
    let _db_user = crate::db::mysql::users::find_or_create_oauth_user(
        &state.mysql,
        "google",
        &google_user.sub,
        google_user.email.as_deref(),
        &google_user.name,
        google_user.picture.as_deref(),
    )
    .await?;

    // Use a synthetic github_id derived from the MySQL user id for Redis compatibility.
    // The Google user's MySQL row id is used as a stable identifier.
    let synthetic_github_id: i64 = _db_user.id as i64;

    let now = Utc::now().to_rfc3339();
    let user = User {
        github_id: synthetic_github_id,
        username: google_user.name.clone(),
        display_name: Some(google_user.name),
        email: google_user.email,
        avatar_url: google_user.picture,
        created_at: now.clone(),
        last_login: now.clone(),
    };

    auth_redis::store_user(&state.redis, &user)
        .await
        .map_err(|e| {
            error!("Failed to store user: {}", e);
            AppError::Internal(e)
        })?;

    issue_session(state, user).await
}

async fn issue_session(state: &AppState, user: User) -> Result<LoginResult, AppError> {
    let session_id = Uuid::new_v4().to_string();
    auth_redis::store_session(&state.redis, &session_id, user.github_id)
        .await
        .map_err(|e| {
            error!("Failed to create session: {}", e);
            AppError::Internal(e)
        })?;

    let now_ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize;

    let claims = Claims {
        sub: user.github_id.to_string(),
        username: user.username.clone(),
        session_id: session_id.clone(),
        iat: now_ts,
        exp: now_ts + auth_redis::SESSION_TTL_SECS as usize,
    };

    let token = jwt::create_token(&state.config.jwt_secret, &claims).map_err(|e| {
        error!("JWT creation failed: {}", e);
        AppError::Internal(e.to_string())
    })?;

    info!(
        github_id = user.github_id,
        username = %user.username,
        session_id = %session_id,
        "User authenticated successfully"
    );

    let cookie_value = format!(
        "token={}; HttpOnly; SameSite=Lax; Path=/; Max-Age={}",
        token,
        auth_redis::SESSION_TTL_SECS
    );

    let redirect_url = format!(
        "{}/login/callback?token={}",
        state.config.frontend_url, token
    );

    Ok(LoginResult {
        token,
        session_id,
        user,
        cookie_value,
        redirect_url,
    })
}

pub async fn get_user_profile(
    redis: &crate::auth::redis::RedisPool,
    auth_user: &AuthUser,
) -> Result<Option<User>, AppError> {
    auth_redis::get_user(redis, auth_user.github_id)
        .await
        .map_err(|e| AppError::Internal(e))
}

pub async fn delete_user_session(
    redis: &crate::auth::redis::RedisPool,
    session_id: &str,
) -> Result<(), AppError> {
    auth_redis::delete_session(redis, session_id)
        .await
        .map_err(|e| AppError::Internal(e))
}

pub async fn list_user_repos(
    state: &AppState,
    auth_user: &AuthUser,
) -> Result<Vec<serde_json::Value>, AppError> {
    let gh_token = auth_redis::get_github_token(&state.redis, auth_user.github_id)
        .await
        .map_err(|e| AppError::Internal(e))?
        .ok_or_else(|| AppError::Unauthorized("GitHub token expired — please re-login".into()))?;

    github_service::fetch_user_repos(
        &state.http,
        &gh_token,
        "updated",
        "desc",
        "30",
        "owner",
    )
    .await
}
