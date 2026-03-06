use bb8::Pool;
use bb8_redis::RedisConnectionManager;
use redis::AsyncCommands;
use tracing::info;

use super::models::User;

/// Session time-to-live: 7 days in seconds.
pub const SESSION_TTL_SECS: u64 = 7 * 24 * 60 * 60;

pub type RedisPool = Pool<RedisConnectionManager>;

/// Create a bb8 connection pool for Redis.
pub async fn create_pool(redis_url: &str) -> RedisPool {
    let manager = RedisConnectionManager::new(redis_url).expect("Invalid REDIS_URL");

    Pool::builder()
        .max_size(16)
        .build(manager)
        .await
        .expect("Failed to create Redis pool")
}

/// Store (or update) a user profile in Redis.
pub async fn store_user(pool: &RedisPool, user: &User) -> Result<(), String> {
    let mut conn = pool
        .get()
        .await
        .map_err(|e| format!("Redis conn error: {}", e))?;
    let key = format!("user:{}", user.github_id);
    let value = serde_json::to_string(user).map_err(|e| format!("Serialize error: {}", e))?;

    conn.set::<_, _, ()>(&key, &value)
        .await
        .map_err(|e| format!("Redis SET error: {}", e))?;

    info!(github_id = user.github_id, "Stored user in Redis");
    Ok(())
}

/// Retrieve a user profile from Redis by GitHub ID.
pub async fn get_user(pool: &RedisPool, github_id: i64) -> Result<Option<User>, String> {
    let mut conn = pool
        .get()
        .await
        .map_err(|e| format!("Redis conn error: {}", e))?;
    let key = format!("user:{}", github_id);

    let value: Option<String> = conn
        .get(&key)
        .await
        .map_err(|e| format!("Redis GET error: {}", e))?;

    match value {
        Some(json) => {
            let user: User =
                serde_json::from_str(&json).map_err(|e| format!("Deserialize error: {}", e))?;
            Ok(Some(user))
        }
        None => Ok(None),
    }
}

/// Create a session in Redis mapping session_id → github_id with a TTL.
pub async fn store_session(
    pool: &RedisPool,
    session_id: &str,
    github_id: i64,
) -> Result<(), String> {
    let mut conn = pool
        .get()
        .await
        .map_err(|e| format!("Redis conn error: {}", e))?;
    let key = format!("session:{}", session_id);

    conn.set_ex::<_, _, ()>(&key, github_id.to_string(), SESSION_TTL_SECS)
        .await
        .map_err(|e| format!("Redis SETEX error: {}", e))?;

    info!(session_id, "Created session in Redis");
    Ok(())
}

/// Look up a session to get the associated github_id.
pub async fn get_session(pool: &RedisPool, session_id: &str) -> Result<Option<i64>, String> {
    let mut conn = pool
        .get()
        .await
        .map_err(|e| format!("Redis conn error: {}", e))?;
    let key = format!("session:{}", session_id);

    let value: Option<String> = conn
        .get(&key)
        .await
        .map_err(|e| format!("Redis GET error: {}", e))?;

    match value {
        Some(id_str) => {
            let id: i64 = id_str
                .parse()
                .map_err(|e| format!("Parse github_id error: {}", e))?;
            Ok(Some(id))
        }
        None => Ok(None),
    }
}

/// Delete a session from Redis (logout).
pub async fn delete_session(pool: &RedisPool, session_id: &str) -> Result<(), String> {
    let mut conn = pool
        .get()
        .await
        .map_err(|e| format!("Redis conn error: {}", e))?;
    let key = format!("session:{}", session_id);

    conn.del::<_, ()>(&key)
        .await
        .map_err(|e| format!("Redis DEL error: {}", e))?;

    info!(session_id, "Deleted session from Redis");
    Ok(())
}

/// Store the GitHub access token for a user in Redis (same TTL as sessions).
pub async fn store_github_token(
    pool: &RedisPool,
    github_id: i64,
    token: &str,
) -> Result<(), String> {
    let mut conn = pool
        .get()
        .await
        .map_err(|e| format!("Redis conn error: {}", e))?;
    let key = format!("gh_token:{}", github_id);

    conn.set_ex::<_, _, ()>(&key, token, SESSION_TTL_SECS)
        .await
        .map_err(|e| format!("Redis SETEX error: {}", e))?;

    info!(github_id, "Stored GitHub token in Redis");
    Ok(())
}

/// Retrieve the GitHub access token for a user from Redis.
pub async fn get_github_token(pool: &RedisPool, github_id: i64) -> Result<Option<String>, String> {
    let mut conn = pool
        .get()
        .await
        .map_err(|e| format!("Redis conn error: {}", e))?;
    let key = format!("gh_token:{}", github_id);

    let value: Option<String> = conn
        .get(&key)
        .await
        .map_err(|e| format!("Redis GET error: {}", e))?;

    Ok(value)
}
