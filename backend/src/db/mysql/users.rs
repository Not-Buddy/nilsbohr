use sqlx::MySqlPool;
use tracing::info;

use super::models::{OAuthIdentityRow, UserRow};

pub async fn find_or_create_oauth_user(
    pool: &MySqlPool,
    provider: &str,
    provider_user_id: &str,
    provider_email: Option<&str>,
    display_name: &str,
    avatar_url: Option<&str>,
) -> Result<UserRow, sqlx::Error> {
    let identity = sqlx::query_as::<_, OAuthIdentityRow>(
        "SELECT * FROM oauth_identities WHERE provider = ? AND provider_user_id = ?"
    )
    .bind(provider)
    .bind(provider_user_id)
    .fetch_optional(pool)
    .await?;

    if let Some(ident) = identity {
        sqlx::query("UPDATE users SET last_login_at = NOW() WHERE id = ?")
            .bind(ident.user_id)
            .execute(pool)
            .await?;

        let user = sqlx::query_as::<_, UserRow>("SELECT * FROM users WHERE id = ?")
            .bind(ident.user_id)
            .fetch_one(pool)
            .await?;

        info!(user_id = user.id, provider, "Existing user logged in");
        return Ok(user);
    }

    let result = sqlx::query(
        "INSERT INTO users (email, display_name, avatar_url, last_login_at) VALUES (?, ?, ?, NOW())"
    )
    .bind(provider_email)
    .bind(display_name)
    .bind(avatar_url)
    .execute(pool)
    .await?;

    let user_id = result.last_insert_id();

    sqlx::query(
        "INSERT INTO oauth_identities (user_id, provider, provider_user_id, provider_email) VALUES (?, ?, ?, ?)"
    )
    .bind(user_id)
    .bind(provider)
    .bind(provider_user_id)
    .bind(provider_email)
    .execute(pool)
    .await?;

    let user = sqlx::query_as::<_, UserRow>("SELECT * FROM users WHERE id = ?")
        .bind(user_id)
        .fetch_one(pool)
        .await?;

    info!(user_id = user.id, provider, "Created new user");
    Ok(user)
}
