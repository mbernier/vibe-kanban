use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json;
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

use super::{task::Task, task_relationship_type::TaskRelationshipType};

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct TaskRelationship {
    pub id: Uuid,
    pub source_task_id: Uuid,
    pub target_task_id: Uuid,
    pub relationship_type_id: Uuid,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>, // JSON object as string
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    // Convenience fields populated via JOIN
    #[serde(skip_serializing_if = "Option::is_none")]
    #[sqlx(default)]
    pub relationship_type_name: Option<String>,
    #[sqlx(default)]
    pub is_directional: Option<bool>,
    #[sqlx(default)]
    pub forward_label: Option<String>,
    #[sqlx(default)]
    pub reverse_label: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateTaskRelationship {
    pub target_task_id: Uuid,
    pub relationship_type_id: Uuid,
    pub data: Option<serde_json::Value>,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateTaskRelationship {
    pub target_task_id: Option<Uuid>,
    pub relationship_type_id: Option<Uuid>,
    pub data: Option<serde_json::Value>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TaskRelationshipWithDetails {
    #[serde(flatten)]
    #[ts(flatten)]
    pub relationship: TaskRelationship,
    pub source_task: Task,
    pub target_task: Task,
    pub relationship_type: TaskRelationshipType,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct TaskRelationshipGrouped {
    pub relationship_type: TaskRelationshipType,
    pub forward: Vec<TaskRelationshipWithDetails>, // Relationships where this task is source
    pub reverse: Vec<TaskRelationshipWithDetails>, // Relationships where this task is target
}

impl TaskRelationship {
    pub fn data_as_json(&self) -> Result<Option<serde_json::Value>, serde_json::Error> {
        match &self.data {
            Some(json_str) => serde_json::from_str(json_str).map(Some),
            None => Ok(None),
        }
    }

    pub async fn find_by_source_task(
        pool: &SqlitePool,
        source_task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskRelationship,
            r#"SELECT 
                tr.id as "id!: Uuid",
                tr.source_task_id as "source_task_id!: Uuid",
                tr.target_task_id as "target_task_id!: Uuid",
                tr.relationship_type_id as "relationship_type_id!: Uuid",
                tr.data,
                tr.note,
                tr.created_at as "created_at!: DateTime<Utc>",
                tr.updated_at as "updated_at!: DateTime<Utc>",
                trt.type_name as "relationship_type_name: String",
                trt.is_directional as "is_directional: i64",
                trt.forward_label as "forward_label: String",
                trt.reverse_label as "reverse_label: String"
               FROM task_relationships tr
               JOIN task_relationship_types trt ON tr.relationship_type_id = trt.id
               WHERE tr.source_task_id = $1
               ORDER BY tr.created_at DESC"#,
            source_task_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_target_task(
        pool: &SqlitePool,
        target_task_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskRelationship,
            r#"SELECT 
                tr.id as "id!: Uuid",
                tr.source_task_id as "source_task_id!: Uuid",
                tr.target_task_id as "target_task_id!: Uuid",
                tr.relationship_type_id as "relationship_type_id!: Uuid",
                tr.data,
                tr.note,
                tr.created_at as "created_at!: DateTime<Utc>",
                tr.updated_at as "updated_at!: DateTime<Utc>",
                trt.type_name as "relationship_type_name: String",
                trt.is_directional as "is_directional: i64",
                trt.forward_label as "forward_label: String",
                trt.reverse_label as "reverse_label: String"
               FROM task_relationships tr
               JOIN task_relationship_types trt ON tr.relationship_type_id = trt.id
               WHERE tr.target_task_id = $1
               ORDER BY tr.created_at DESC"#,
            target_task_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_task(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<TaskRelationshipGrouped>, sqlx::Error> {
        // Get all relationships where task is source or target
        let forward_rels = Self::find_by_source_task(pool, task_id).await?;
        let reverse_rels = Self::find_by_target_task(pool, task_id).await?;

        // Load full details for all relationships
        let mut forward_details = Vec::new();
        for rel in forward_rels {
            let details = Self::find_with_details_by_id(pool, rel.id).await?;
            if let Some(details) = details {
                forward_details.push(details);
            }
        }

        let mut reverse_details = Vec::new();
        for rel in reverse_rels {
            let details = Self::find_with_details_by_id(pool, rel.id).await?;
            if let Some(details) = details {
                reverse_details.push(details);
            }
        }

        // Group by relationship type
        let mut grouped: std::collections::HashMap<Uuid, TaskRelationshipGrouped> = std::collections::HashMap::new();

        for detail in forward_details {
            let type_id = detail.relationship_type.id;
            grouped
                .entry(type_id)
                .or_insert_with(|| TaskRelationshipGrouped {
                    relationship_type: detail.relationship_type.clone(),
                    forward: Vec::new(),
                    reverse: Vec::new(),
                })
                .forward
                .push(detail);
        }

        for detail in reverse_details {
            let type_id = detail.relationship_type.id;
            grouped
                .entry(type_id)
                .or_insert_with(|| TaskRelationshipGrouped {
                    relationship_type: detail.relationship_type.clone(),
                    forward: Vec::new(),
                    reverse: Vec::new(),
                })
                .reverse
                .push(detail);
        }

        Ok(grouped.into_values().collect())
    }

    pub async fn find_by_type(
        pool: &SqlitePool,
        relationship_type_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskRelationship,
            r#"SELECT 
                tr.id as "id!: Uuid",
                tr.source_task_id as "source_task_id!: Uuid",
                tr.target_task_id as "target_task_id!: Uuid",
                tr.relationship_type_id as "relationship_type_id!: Uuid",
                tr.data,
                tr.note,
                tr.created_at as "created_at!: DateTime<Utc>",
                tr.updated_at as "updated_at!: DateTime<Utc>",
                trt.type_name as "relationship_type_name: String",
                trt.is_directional as "is_directional: i64",
                trt.forward_label as "forward_label: String",
                trt.reverse_label as "reverse_label: String"
               FROM task_relationships tr
               JOIN task_relationship_types trt ON tr.relationship_type_id = trt.id
               WHERE tr.relationship_type_id = $1
               ORDER BY tr.created_at DESC"#,
            relationship_type_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_blocking_relationships(
        pool: &SqlitePool,
        task_id: Uuid,
    ) -> Result<Vec<(Self, Task)>, sqlx::Error> {
        // Find relationships where this task is the target and the source task
        // is in a blocking status (we'll filter by status in Rust after loading relationship type)
        let rels = sqlx::query_as!(
            TaskRelationship,
            r#"SELECT 
                tr.id as "id!: Uuid",
                tr.source_task_id as "source_task_id!: Uuid",
                tr.target_task_id as "target_task_id!: Uuid",
                tr.relationship_type_id as "relationship_type_id!: Uuid",
                tr.data,
                tr.note,
                tr.created_at as "created_at!: DateTime<Utc>",
                tr.updated_at as "updated_at!: DateTime<Utc>",
                trt.type_name as "relationship_type_name: String",
                trt.is_directional as "is_directional: i64",
                trt.forward_label as "forward_label: String",
                trt.reverse_label as "reverse_label: String"
               FROM task_relationships tr
               JOIN task_relationship_types trt ON tr.relationship_type_id = trt.id
               WHERE tr.target_task_id = $1
                 AND trt.enforces_blocking = 1"#,
            task_id
        )
        .fetch_all(pool)
        .await?;

        // Load source tasks and filter by blocking source statuses
        let mut result = Vec::new();
        for rel in rels {
            if let Ok(Some(source_task)) = Task::find_by_id(pool, rel.source_task_id).await {
                // Load relationship type to check blocking_source_statuses
                if let Ok(Some(rel_type)) = TaskRelationshipType::find_by_id(pool, rel.relationship_type_id).await {
                    if let Ok(Some(source_statuses)) = rel_type.blocking_source_statuses_vec() {
                        if source_statuses.contains(&source_task.status) {
                            result.push((rel, source_task));
                        }
                    }
                }
            }
        }

        Ok(result)
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskRelationship,
            r#"SELECT 
                tr.id as "id!: Uuid",
                tr.source_task_id as "source_task_id!: Uuid",
                tr.target_task_id as "target_task_id!: Uuid",
                tr.relationship_type_id as "relationship_type_id!: Uuid",
                tr.data,
                tr.note,
                tr.created_at as "created_at!: DateTime<Utc>",
                tr.updated_at as "updated_at!: DateTime<Utc>",
                trt.type_name as "relationship_type_name: String",
                trt.is_directional as "is_directional: i64",
                trt.forward_label as "forward_label: String",
                trt.reverse_label as "reverse_label: String"
               FROM task_relationships tr
               JOIN task_relationship_types trt ON tr.relationship_type_id = trt.id
               WHERE tr.id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_with_details_by_id(
        pool: &SqlitePool,
        id: Uuid,
    ) -> Result<Option<TaskRelationshipWithDetails>, sqlx::Error> {
        let rel = Self::find_by_id(pool, id).await?;
        match rel {
            Some(rel) => {
                let source_task = Task::find_by_id(pool, rel.source_task_id)
                    .await?
                    .ok_or(sqlx::Error::RowNotFound)?;
                let target_task = Task::find_by_id(pool, rel.target_task_id)
                    .await?
                    .ok_or(sqlx::Error::RowNotFound)?;
                let relationship_type = TaskRelationshipType::find_by_id(pool, rel.relationship_type_id)
                    .await?
                    .ok_or(sqlx::Error::RowNotFound)?;

                Ok(Some(TaskRelationshipWithDetails {
                    relationship: rel,
                    source_task,
                    target_task,
                    relationship_type,
                }))
            }
            None => Ok(None),
        }
    }

    pub async fn create(
        pool: &SqlitePool,
        source_task_id: Uuid,
        data: &CreateTaskRelationship,
    ) -> Result<Self, sqlx::Error> {
        // Prevent self-referential relationships
        if source_task_id == data.target_task_id {
            return Err(sqlx::Error::Protocol(
                "Cannot create self-referential relationship".into(),
            ));
        }

        // Verify target task exists
        let _target_task = Task::find_by_id(pool, data.target_task_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        // Verify relationship type exists
        let _rel_type = TaskRelationshipType::find_by_id(pool, data.relationship_type_id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let id = Uuid::new_v4();
        let data_json = data.data.as_ref().map(|v| serde_json::to_string(v).unwrap());

        sqlx::query_as!(
            TaskRelationship,
            r#"INSERT INTO task_relationships (
                id, source_task_id, target_task_id, relationship_type_id, data, note
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING 
                id as "id!: Uuid",
                source_task_id as "source_task_id!: Uuid",
                target_task_id as "target_task_id!: Uuid",
                relationship_type_id as "relationship_type_id!: Uuid",
                data,
                note,
                created_at as "created_at!: DateTime<Utc>",
                updated_at as "updated_at!: DateTime<Utc>",
                NULL as "relationship_type_name: String",
                NULL as "is_directional: i64",
                NULL as "forward_label: String",
                NULL as "reverse_label: String""#,
            id,
            source_task_id,
            data.target_task_id,
            data.relationship_type_id,
            data_json,
            data.note
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateTaskRelationship,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let target_task_id = data.target_task_id.unwrap_or(existing.target_task_id);
        let relationship_type_id = data.relationship_type_id.unwrap_or(existing.relationship_type_id);
        let data_json = match &data.data {
            Some(v) => Some(serde_json::to_string(v).unwrap()),
            None => existing.data.clone(),
        };
        let note = data.note.as_ref().or(existing.note.as_ref());

        // Prevent self-referential relationships
        if existing.source_task_id == target_task_id {
            return Err(sqlx::Error::Protocol(
                "Cannot create self-referential relationship".into(),
            ));
        }

        // Verify target task exists if changed
        if data.target_task_id.is_some() {
            let _target_task = Task::find_by_id(pool, target_task_id)
                .await?
                .ok_or(sqlx::Error::RowNotFound)?;
        }

        // Verify relationship type exists if changed
        if data.relationship_type_id.is_some() {
            let _rel_type = TaskRelationshipType::find_by_id(pool, relationship_type_id)
                .await?
                .ok_or(sqlx::Error::RowNotFound)?;
        }

        sqlx::query_as!(
            TaskRelationship,
            r#"UPDATE task_relationships
               SET target_task_id = $2,
                   relationship_type_id = $3,
                   data = $4,
                   note = $5,
                   updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING 
                   id as "id!: Uuid",
                   source_task_id as "source_task_id!: Uuid",
                   target_task_id as "target_task_id!: Uuid",
                   relationship_type_id as "relationship_type_id!: Uuid",
                   data,
                   note,
                   created_at as "created_at!: DateTime<Utc>",
                   updated_at as "updated_at!: DateTime<Utc>",
                   NULL as "relationship_type_name: String",
                   NULL as "is_directional: i64",
                   NULL as "forward_label: String",
                   NULL as "reverse_label: String""#,
            id,
            target_task_id,
            relationship_type_id,
            data_json,
            note
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM task_relationships WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn delete_by_task(pool: &SqlitePool, task_id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM task_relationships WHERE source_task_id = $1 OR target_task_id = $1",
            task_id
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}

