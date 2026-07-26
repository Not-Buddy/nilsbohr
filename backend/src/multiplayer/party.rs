use super::Party;

impl Party {
    pub fn add_member(&mut self, user_id: i64, display_name: String) {
        if !self.members.iter().any(|m| m.user_id == user_id) {
            self.members.push(super::PartyMember {
                user_id,
                display_name,
                x: 0.0,
                y: 0.0,
                scene: super::SceneRef {
                    scene_type: "world".to_string(),
                    id: "overworld".to_string(),
                },
            });
        }
    }

    pub fn remove_member(&mut self, user_id: i64) {
        self.members.retain(|m| m.user_id != user_id);
    }

    pub fn is_empty(&self) -> bool {
        self.members.is_empty()
    }
}
