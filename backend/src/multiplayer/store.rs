use std::collections::HashMap;
use std::sync::Mutex;
use redis::AsyncCommands;
use tokio::sync::broadcast;

use crate::auth::redis::RedisPool;
use crate::error::AppError;

use super::Party;

static TTL_SECS: u64 = 86400;

static BROADCASTS: std::sync::LazyLock<Mutex<HashMap<String, broadcast::Sender<String>>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

pub async fn save_party(pool: &RedisPool, party: &Party) -> Result<(), AppError> {
    let mut conn = pool.get().await.map_err(|e| {
        AppError::Internal(format!("Redis conn error: {}", e))
    })?;

    let key = format!("party:{}", party.id);
    let value = serde_json::to_string(party)
        .map_err(|e| AppError::Internal(format!("Serialize error: {}", e)))?;

    conn.set_ex::<_, _, ()>(&key, &value, TTL_SECS)
        .await
        .map_err(|e| AppError::Internal(format!("Redis SETEX error: {}", e)))?;

    Ok(())
}

pub async fn get_party(pool: &RedisPool, party_id: &str) -> Result<Option<Party>, AppError> {
    let mut conn = pool.get().await.map_err(|e| {
        AppError::Internal(format!("Redis conn error: {}", e))
    })?;

    let key = format!("party:{}", party_id);
    let value: Option<String> = conn.get(&key).await
        .map_err(|e| AppError::Internal(format!("Redis GET error: {}", e)))?;

    match value {
        Some(json) => {
            let party: Party = serde_json::from_str(&json)
                .map_err(|e| AppError::Internal(format!("Deserialize error: {}", e)))?;
            Ok(Some(party))
        }
        None => Ok(None),
    }
}

pub async fn update_party(pool: &RedisPool, party: &Party) -> Result<(), AppError> {
    save_party(pool, party).await
}

pub fn join_or_create_broadcast(party_id: &str) -> broadcast::Receiver<String> {
    let mut map = BROADCASTS.lock().unwrap();
    map.entry(party_id.to_string())
        .or_insert_with(|| {
            let (tx, _) = broadcast::channel(256);
            tx
        })
        .subscribe()
}

pub fn broadcast_message(party_id: &str, message: String) -> Result<(), String> {
    let map = BROADCASTS.lock().unwrap();
    if let Some(tx) = map.get(party_id) {
        let _ = tx.send(message);
        Ok(())
    } else {
        Err("No broadcast channel for party".into())
    }
}
