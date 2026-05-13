use mongodb::bson::oid::ObjectId;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoDoc {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub github_user_id: String,
    pub repo_url: String,
    pub project_name: String,
    pub owner: String,
    pub repo_name: String,
    pub default_branch: String,
    pub latest_commit_hash: Option<String>,
    pub last_parsed_at: Option<String>,
    pub last_updated_at: String,
    pub clone_status: String,
    pub github_metadata: Option<GitHubRepoMetadata>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRepoMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stars: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(default)]
    pub topics: Vec<String>,
    #[serde(default)]
    pub fork: bool,
    #[serde(default)]
    pub archived: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pushed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRefResponse {
    #[serde(rename = "ref")]
    pub ref_name: String,
    pub object: GitHubRefObject,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRefObject {
    pub sha: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedWorldDoc {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub repository_id: ObjectId,
    pub commit_hash: String,
    pub parsed_at: String,
    pub world_meta_dominant_language: String,
    pub world_meta_total_cities: u32,
    pub world_meta_total_buildings: u32,
    pub world_meta_total_rooms: u32,
    pub world_meta_total_artifacts: u32,
    pub world_meta_complexity_score: f32,
    pub entity_count: u32,
    pub route_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityDoc {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub world_id: ObjectId,
    pub entity_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_entity_id: Option<String>,
    pub name: String,
    pub entity_type: String,
    pub sort_order: i32,
    pub loc: u32,
    pub entity: crate::models::GameEntity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteDoc {
    #[serde(rename = "_id", skip_serializing_if = "Option::is_none")]
    pub id: Option<ObjectId>,
    pub world_id: ObjectId,
    pub route: crate::models::Route,
}

#[derive(Debug, Deserialize)]
pub struct GitHubRepoResponse {
    pub description: Option<String>,
    #[serde(rename = "stargazers_count")]
    pub stargazers_count: Option<i64>,
    pub language: Option<String>,
    #[serde(default)]
    pub topics: Vec<String>,
    #[serde(default)]
    pub fork: bool,
    #[serde(default)]
    pub archived: bool,
    #[serde(rename = "default_branch")]
    pub default_branch: Option<String>,
    #[serde(rename = "pushed_at")]
    pub pushed_at: Option<String>,
}
