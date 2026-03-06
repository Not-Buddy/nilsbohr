use std::env;

#[derive(Clone, Debug)]
pub struct AuthConfig {
    pub redis_url: String,
    pub github_client_id: String,
    pub github_client_secret: String,
    pub jwt_secret: String,
    pub frontend_url: String,
}

impl AuthConfig {
    pub fn from_env() -> Self {
        Self {
            redis_url: env::var("REDIS_URL").expect("REDIS_URL must be set"),
            github_client_id: env::var("GITHUB_CLIENT_ID").expect("GITHUB_CLIENT_ID must be set"),
            github_client_secret: env::var("GITHUB_CLIENT_SECRET")
                .expect("GITHUB_CLIENT_SECRET must be set"),
            jwt_secret: env::var("JWT_SECRET").expect("JWT_SECRET must be set"),
            frontend_url: env::var("FRONTEND_URL").expect("FRONTEND_URL must be set"),
        }
    }
}
