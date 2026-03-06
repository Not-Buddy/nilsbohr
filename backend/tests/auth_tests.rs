use axum::http::{Request, StatusCode};
use backend::auth::{self, models::Claims};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tower::ServiceExt;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn now_secs() -> usize {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as usize
}

/// Build a test app backed by a real Redis instance.
/// Requires REDIS_URL to be reachable (default: redis://127.0.0.1:6379).
async fn test_app() -> (axum::Router, Arc<auth::AppState>) {
    dotenvy::dotenv().ok();

    let config = auth::AuthConfig {
        redis_url: std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".into()),
        github_client_id: "test_client_id".into(),
        github_client_secret: "test_client_secret".into(),
        jwt_secret: "test-jwt-secret-key-for-integration-tests".into(),
        frontend_url: "http://localhost:3000".into(),
    };

    let pool = auth::redis::create_pool(&config.redis_url).await;
    let state = Arc::new(auth::AppState {
        config,
        redis: pool,
        http: reqwest::Client::new(),
    });

    let app = backend::build_app(state.clone());
    (app, state)
}

/// Create a valid JWT + Redis session for testing authenticated routes.
async fn create_test_session(state: &auth::AppState) -> (String, String) {
    let session_id = uuid::Uuid::new_v4().to_string();
    let github_id: i64 = 123456;

    // Store user in Redis
    let user = auth::models::User {
        github_id,
        username: "testuser".into(),
        display_name: Some("Test User".into()),
        email: Some("test@example.com".into()),
        avatar_url: None,
        created_at: chrono::Utc::now().to_rfc3339(),
        last_login: chrono::Utc::now().to_rfc3339(),
    };
    auth::redis::store_user(&state.redis, &user)
        .await
        .expect("store user");

    // Store session in Redis
    auth::redis::store_session(&state.redis, &session_id, github_id)
        .await
        .expect("store session");

    // Create JWT
    let claims = Claims {
        sub: github_id.to_string(),
        username: "testuser".into(),
        session_id: session_id.clone(),
        iat: now_secs(),
        exp: now_secs() + 3600,
    };
    let token = auth::jwt::create_token(&state.config.jwt_secret, &claims).expect("create token");

    (token, session_id)
}

// ---------------------------------------------------------------------------
// Tests: Public routes
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_health_check() {
    let (app, _state) = test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["status"], "healthy");
}

// ---------------------------------------------------------------------------
// Tests: Auth endpoints — unauthenticated
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_parse_requires_auth() {
    let (app, _state) = test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/parse")
                .header("content-type", "application/json")
                .body(axum::body::Body::from(
                    r#"{"url":"https://github.com/octocat/Hello-World"}"#,
                ))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        response.status(),
        StatusCode::UNAUTHORIZED,
        "/parse should reject unauthenticated requests"
    );
}

#[tokio::test]
async fn test_me_requires_auth() {
    let (app, _state) = test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/auth/me")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        response.status(),
        StatusCode::UNAUTHORIZED,
        "/auth/me should reject unauthenticated requests"
    );
}

#[tokio::test]
async fn test_logout_requires_auth() {
    let (app, _state) = test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/logout")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        response.status(),
        StatusCode::UNAUTHORIZED,
        "/auth/logout should reject unauthenticated requests"
    );
}

// ---------------------------------------------------------------------------
// Tests: OAuth login redirect
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_login_redirects_to_github() {
    let (app, state) = test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/auth/login")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        response.status(),
        StatusCode::TEMPORARY_REDIRECT,
        "/auth/login should redirect"
    );

    let location = response
        .headers()
        .get("location")
        .expect("should have Location header")
        .to_str()
        .unwrap();

    assert!(
        location.starts_with("https://github.com/login/oauth/authorize"),
        "should redirect to GitHub OAuth"
    );
    assert!(
        location.contains(&format!("client_id={}", state.config.github_client_id)),
        "should include the client_id in the redirect URL"
    );
    assert!(location.contains("scope="), "should request OAuth scopes");
}

// ---------------------------------------------------------------------------
// Tests: OAuth callback with invalid code
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_callback_rejects_invalid_code() {
    let (app, _state) = test_app().await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/auth/callback?code=invalid_test_code")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // GitHub will reject the fake code — our handler should return an error
    assert!(
        response.status() == StatusCode::BAD_REQUEST
            || response.status() == StatusCode::INTERNAL_SERVER_ERROR,
        "callback with invalid code should fail, got {}",
        response.status()
    );
}

// ---------------------------------------------------------------------------
// Tests: Authenticated routes (with valid JWT + session)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_me_with_valid_token_via_header() {
    let (app, state) = test_app().await;
    let (token, _session_id) = create_test_session(&state).await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/auth/me")
                .header("authorization", format!("Bearer {}", token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        response.status(),
        StatusCode::OK,
        "/auth/me should succeed with valid Bearer token"
    );

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["username"], "testuser");
    assert_eq!(json["github_id"], 123456);
}

#[tokio::test]
async fn test_me_with_valid_token_via_cookie() {
    let (app, state) = test_app().await;
    let (token, _session_id) = create_test_session(&state).await;

    let response = app
        .oneshot(
            Request::builder()
                .uri("/auth/me")
                .header("cookie", format!("token={}", token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        response.status(),
        StatusCode::OK,
        "/auth/me should succeed with valid cookie token"
    );
}

// ---------------------------------------------------------------------------
// Tests: Token validation edge cases
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_me_rejects_expired_token() {
    let (app, state) = test_app().await;

    // Create an expired JWT
    let session_id = uuid::Uuid::new_v4().to_string();
    auth::redis::store_session(&state.redis, &session_id, 999999)
        .await
        .expect("store session");

    let claims = Claims {
        sub: "999999".into(),
        username: "expired_user".into(),
        session_id,
        iat: now_secs() - 7200,
        exp: now_secs() - 3600, // expired 1 hour ago
    };
    let token = auth::jwt::create_token(&state.config.jwt_secret, &claims).expect("create token");

    let response = app
        .oneshot(
            Request::builder()
                .uri("/auth/me")
                .header("authorization", format!("Bearer {}", token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        response.status(),
        StatusCode::UNAUTHORIZED,
        "expired token should be rejected"
    );
}

#[tokio::test]
async fn test_me_rejects_invalid_signature() {
    let (app, state) = test_app().await;

    let session_id = uuid::Uuid::new_v4().to_string();
    auth::redis::store_session(&state.redis, &session_id, 888888)
        .await
        .expect("store session");

    let claims = Claims {
        sub: "888888".into(),
        username: "wrong_sig_user".into(),
        session_id,
        iat: now_secs(),
        exp: now_secs() + 3600,
    };
    // Sign with wrong secret
    let token = auth::jwt::create_token("wrong-secret-key", &claims).expect("create token");

    let response = app
        .oneshot(
            Request::builder()
                .uri("/auth/me")
                .header("authorization", format!("Bearer {}", token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        response.status(),
        StatusCode::UNAUTHORIZED,
        "token signed with wrong key should be rejected"
    );
}

#[tokio::test]
async fn test_me_rejects_deleted_session() {
    let (app, state) = test_app().await;
    let (token, session_id) = create_test_session(&state).await;

    // Delete the session from Redis
    auth::redis::delete_session(&state.redis, &session_id)
        .await
        .expect("delete session");

    let response = app
        .oneshot(
            Request::builder()
                .uri("/auth/me")
                .header("authorization", format!("Bearer {}", token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(
        response.status(),
        StatusCode::UNAUTHORIZED,
        "valid JWT with deleted session should be rejected"
    );
}

// ---------------------------------------------------------------------------
// Tests: Logout flow
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_logout_clears_session() {
    let (app, state) = test_app().await;
    let (token, session_id) = create_test_session(&state).await;

    // Logout
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/logout")
                .header("authorization", format!("Bearer {}", token))
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK, "logout should succeed");

    // Verify Set-Cookie clears the token
    let set_cookie = response
        .headers()
        .get("set-cookie")
        .expect("should have Set-Cookie header")
        .to_str()
        .unwrap();
    assert!(
        set_cookie.contains("Max-Age=0"),
        "cookie should be cleared on logout"
    );

    // Verify session is gone from Redis
    let session = auth::redis::get_session(&state.redis, &session_id)
        .await
        .expect("redis lookup");
    assert!(session.is_none(), "session should be deleted after logout");
}
