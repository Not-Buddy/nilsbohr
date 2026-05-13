use chrono::Utc;
use mongodb::Database;
use mongodb::bson::{doc, oid::ObjectId};
use tracing::{debug, info};

use super::models::RepoDoc;
use crate::error::AppError;
use crate::db::models::GitHubRepoMetadata;

pub async fn find_or_create_repo(
    db: &Database,
    repo_url: &str,
    project_name: &str,
    owner: &str,
    repo_name: &str,
    github_user_id: &str,
) -> Result<RepoDoc, AppError> {
    let collection = db.collection::<RepoDoc>("repositories");

    if let Ok(Some(existing)) = collection.find_one(doc! { "repo_url": repo_url }).await {
        debug!("Found existing repository: {}", repo_url);
        return Ok(existing);
    }

    let now = Utc::now().to_rfc3339();
    let repo = RepoDoc {
        id: None,
        github_user_id: github_user_id.to_string(),
        repo_url: repo_url.to_string(),
        project_name: project_name.to_string(),
        owner: owner.to_string(),
        repo_name: repo_name.to_string(),
        default_branch: "main".to_string(),
        latest_commit_hash: None,
        last_parsed_at: None,
        last_updated_at: now.clone(),
        clone_status: "active".to_string(),
        github_metadata: None,
        created_at: now,
    };

    let result = collection.insert_one(&repo).await?;
    let inserted_id = result
        .inserted_id
        .as_object_id()
        .ok_or_else(|| AppError::Database(mongodb::error::Error::custom("Failed to get inserted ID")))?;

    let mut created = repo;
    created.id = Some(inserted_id);
    info!("Created new repository document: {}", repo_url);
    Ok(created)
}

pub async fn update_repo_after_parse(
    db: &Database,
    repo_id: ObjectId,
    latest_commit_hash: &str,
    default_branch: &str,
    metadata: Option<GitHubRepoMetadata>,
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    let collection = db.collection::<RepoDoc>("repositories");

    let mut update_doc = doc! {
        "latest_commit_hash": latest_commit_hash,
        "default_branch": default_branch,
        "last_parsed_at": &now,
        "last_updated_at": &now,
    };

    if let Some(m) = metadata {
        let bson_meta = mongodb::bson::to_bson(&m).map_err(|e| AppError::Internal(e.to_string()))?;
        update_doc.insert("github_metadata", bson_meta);
    }

    collection
        .update_one(doc! { "_id": repo_id }, doc! { "$set": update_doc })
        .await?;

    Ok(())
}
