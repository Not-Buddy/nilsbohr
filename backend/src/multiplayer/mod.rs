pub mod messages;
pub mod party;
pub mod store;

use std::sync::Arc;
use axum::extract::{Path, State, WebSocketUpgrade};
use axum::response::IntoResponse;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::auth::AuthUser;
use crate::error::AppError;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartyMember {
    pub user_id: i64,
    pub display_name: String,
    pub x: f32,
    pub y: f32,
    pub scene: SceneRef,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SceneRef {
    #[serde(rename = "type")]
    pub scene_type: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Party {
    pub id: String,
    pub host_id: i64,
    pub repo_url: String,
    pub members: Vec<PartyMember>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePartyRequest {
    pub repo_url: String,
}

#[derive(Debug, Serialize)]
pub struct CreatePartyResponse {
    pub party_id: String,
}

#[derive(Debug, Serialize)]
pub struct PartyResponse {
    pub id: String,
    pub host_id: i64,
    pub repo_url: String,
    pub members: Vec<PartyMember>,
    pub created_at: String,
}

pub async fn create_party(
    State(state): State<Arc<AppState>>,
    auth_user: AuthUser,
    axum::extract::Json(payload): axum::extract::Json<CreatePartyRequest>,
) -> Result<axum::Json<CreatePartyResponse>, AppError> {
    let party_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let party = Party {
        id: party_id.clone(),
        host_id: auth_user.github_id,
        repo_url: payload.repo_url,
        members: vec![PartyMember {
            user_id: auth_user.github_id,
            display_name: auth_user.username,
            x: 0.0,
            y: 0.0,
            scene: SceneRef {
                scene_type: "world".to_string(),
                id: "overworld".to_string(),
            },
        }],
        created_at: now,
    };

    store::save_party(&state.redis, &party).await?;

    Ok(axum::Json(CreatePartyResponse { party_id }))
}

pub async fn get_party(
    State(state): State<Arc<AppState>>,
    _auth_user: AuthUser,
    Path(party_id): Path<String>,
) -> Result<axum::Json<PartyResponse>, AppError> {
    let party = store::get_party(&state.redis, &party_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Party not found".into()))?;

    Ok(axum::Json(PartyResponse {
        id: party.id,
        host_id: party.host_id,
        repo_url: party.repo_url,
        members: party.members,
        created_at: party.created_at,
    }))
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Path(party_id): Path<String>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state, party_id))
}

async fn handle_socket(socket: axum::extract::ws::WebSocket, _state: Arc<AppState>, party_id: String) {
    use futures::SinkExt;
    use futures::StreamExt;

    let rx = store::join_or_create_broadcast(&party_id);

    let (mut sender, mut receiver) = socket.split();

    let mut rx = rx.resubscribe();

    let send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender.send(axum::extract::ws::Message::Text(msg)).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = receiver.next().await {
        if let axum::extract::ws::Message::Text(text) = msg {
            let _ = store::broadcast_message(&party_id, text);
        }
    }

    send_task.abort();
}
