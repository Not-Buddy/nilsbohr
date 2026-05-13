use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Unauthorized(String),
    #[error("Database error: {0}")]
    Database(#[from] mongodb::error::Error),
    #[error("Git error: {0}")]
    Git(String),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("External API error: {0}")]
    ExternalApi(String),
    #[error("{0}")]
    Internal(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg.clone()),
            AppError::Database(e) => (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()),
            AppError::Git(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            AppError::Parse(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
            AppError::ExternalApi(msg) => (StatusCode::BAD_GATEWAY, msg.clone()),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
        };
        (
            status,
            axum::Json(serde_json::json!({ "error": message })),
        )
            .into_response()
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Internal(s)
    }
}
