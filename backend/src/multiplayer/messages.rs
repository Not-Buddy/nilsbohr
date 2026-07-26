use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PartyMessage {
    Join {
        user_id: i64,
        display_name: String,
    },
    Leave {
        user_id: i64,
    },
    PlayerMove {
        user_id: i64,
        x: f32,
        y: f32,
        direction: String,
    },
    PlayerEnteredScene {
        user_id: i64,
        scene: super::SceneRef,
    },
    PartyState {
        members: Vec<super::PartyMember>,
    },
}
