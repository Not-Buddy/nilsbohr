use axum::{
    extract::{FromRef, FromRequestParts},
    http::{StatusCode, request::Parts},
    response::{IntoResponse, Response},
};
use std::future::Future;
use std::pin::Pin;
use tracing::warn;

use super::AppState;
use super::jwt;
use super::models::AuthUser;

/// Rejection type for failed authentication.
pub struct AuthError(String);

impl IntoResponse for AuthError {
    fn into_response(self) -> Response {
        (
            StatusCode::UNAUTHORIZED,
            axum::Json(serde_json::json!({ "error": self.0 })),
        )
            .into_response()
    }
}

impl<S> FromRequestParts<S> for AuthUser
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AuthError;

    fn from_request_parts<'life0, 'life1, 'async_trait>(
        parts: &'life0 mut Parts,
        state: &'life1 S,
    ) -> Pin<Box<dyn Future<Output = Result<Self, Self::Rejection>> + Send + 'async_trait>>
    where
        'life0: 'async_trait,
        'life1: 'async_trait,
        Self: 'async_trait,
    {
        Box::pin(async move {
            let app_state = AppState::from_ref(state);

            // 1. Extract token from Authorization header or cookie
            let token = extract_token(parts)?;

            // 2. Verify JWT
            let claims = jwt::verify_token(&app_state.config.jwt_secret, &token).map_err(|e| {
                warn!("JWT verification failed: {}", e);
                AuthError("Invalid or expired token".into())
            })?;

            // 3. Check session still exists in Redis
            let session_exists = super::redis::get_session(&app_state.redis, &claims.session_id)
                .await
                .map_err(|e| {
                    warn!("Redis session lookup failed: {}", e);
                    AuthError("Session validation failed".into())
                })?;

            if session_exists.is_none() {
                warn!(session_id = %claims.session_id, "Session not found in Redis");
                return Err(AuthError("Session expired or invalid".into()));
            }

            Ok(AuthUser {
                github_id: claims
                    .sub
                    .parse::<i64>()
                    .map_err(|_| AuthError("Invalid user ID in token".into()))?,
                username: claims.username,
                session_id: claims.session_id,
            })
        })
    }
}

/// Extract the JWT token from either the `Authorization: Bearer <token>` header
/// or the `token` cookie.
fn extract_token(parts: &Parts) -> Result<String, AuthError> {
    // Try Authorization header first
    if let Some(auth_header) = parts.headers.get("authorization") {
        let header_str = auth_header
            .to_str()
            .map_err(|_| AuthError("Invalid Authorization header".into()))?;

        if let Some(token) = header_str.strip_prefix("Bearer ") {
            return Ok(token.to_string());
        }
    }

    // Fall back to cookie
    if let Some(cookie_header) = parts.headers.get("cookie") {
        let cookie_str = cookie_header
            .to_str()
            .map_err(|_| AuthError("Invalid cookie header".into()))?;

        for cookie_part in cookie_str.split(';') {
            let trimmed = cookie_part.trim();
            if let Some(value) = trimmed.strip_prefix("token=") {
                return Ok(value.to_string());
            }
        }
    }

    Err(AuthError("Missing authentication token".into()))
}
