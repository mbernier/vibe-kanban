use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json;
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

use super::task::TaskStatus;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct TaskRelationshipType {
    pub id: Uuid,
    pub type_name: String,
    pub display_name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub is_system: bool,
    #[serde(default)]
    pub is_directional: bool,
    pub forward_label: Option<String>,
    pub reverse_label: Option<String>,
    #[serde(default)]
    pub enforces_blocking: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(type = "string[] | null")]
    pub blocking_disabled_statuses: Option<String>, // JSON array as string - frontend should parse
    #[serde(skip_serializing_if = "Option::is_none")]
    #[ts(type = "string[] | null")]
    pub blocking_source_statuses: Option<String>, // JSON array as string - frontend should parse
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateTaskRelationshipType {
    pub type_name: String,
    pub display_name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub is_directional: bool,
    pub forward_label: Option<String>,
    pub reverse_label: Option<String>,
    #[serde(default)]
    pub enforces_blocking: bool,
    pub blocking_disabled_statuses: Option<Vec<String>>,
    pub blocking_source_statuses: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateTaskRelationshipType {
    pub type_name: Option<String>,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub is_directional: Option<bool>,
    pub forward_label: Option<String>,
    pub reverse_label: Option<String>,
    pub enforces_blocking: Option<bool>,
    pub blocking_disabled_statuses: Option<Vec<String>>,
    pub blocking_source_statuses: Option<Vec<String>>,
}

impl TaskRelationshipType {
    pub fn blocking_disabled_statuses_vec(&self) -> Result<Option<Vec<TaskStatus>>, serde_json::Error> {
        match &self.blocking_disabled_statuses {
            Some(json_str) => {
                let statuses: Vec<String> = serde_json::from_str(json_str)?;
                let task_statuses: Result<Vec<TaskStatus>, _> = statuses
                    .iter()
                    .map(|s| s.parse())
                    .collect();
                Ok(Some(task_statuses?))
            }
            None => Ok(None),
        }
    }

    pub fn blocking_source_statuses_vec(&self) -> Result<Option<Vec<TaskStatus>>, serde_json::Error> {
        match &self.blocking_source_statuses {
            Some(json_str) => {
                let statuses: Vec<String> = serde_json::from_str(json_str)?;
                let task_statuses: Result<Vec<TaskStatus>, _> = statuses
                    .iter()
                    .map(|s| s.parse())
                    .collect();
                Ok(Some(task_statuses?))
            }
            None => Ok(None),
        }
    }

    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskRelationshipType,
            r#"SELECT 
                id as "id!: Uuid", 
                type_name, 
                display_name, 
                description,
                is_system as "is_system!: i64",
                is_directional as "is_directional!: i64",
                forward_label,
                reverse_label,
                enforces_blocking as "enforces_blocking!: i64",
                blocking_disabled_statuses,
                blocking_source_statuses,
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_relationship_types
               ORDER BY display_name ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskRelationshipType,
            r#"SELECT 
                id as "id!: Uuid", 
                type_name, 
                display_name, 
                description,
                is_system as "is_system!: i64",
                is_directional as "is_directional!: i64",
                forward_label,
                reverse_label,
                enforces_blocking as "enforces_blocking!: i64",
                blocking_disabled_statuses,
                blocking_source_statuses,
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_relationship_types
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_type_name(pool: &SqlitePool, type_name: &str) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskRelationshipType,
            r#"SELECT 
                id as "id!: Uuid", 
                type_name, 
                display_name, 
                description,
                is_system as "is_system!: i64",
                is_directional as "is_directional!: i64",
                forward_label,
                reverse_label,
                enforces_blocking as "enforces_blocking!: i64",
                blocking_disabled_statuses,
                blocking_source_statuses,
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_relationship_types
               WHERE type_name = $1"#,
            type_name
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_system_types(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskRelationshipType,
            r#"SELECT 
                id as "id!: Uuid", 
                type_name, 
                display_name, 
                description,
                is_system as "is_system!: i64",
                is_directional as "is_directional!: i64",
                forward_label,
                reverse_label,
                enforces_blocking as "enforces_blocking!: i64",
                blocking_disabled_statuses,
                blocking_source_statuses,
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_relationship_types
               WHERE is_system = 1
               ORDER BY display_name ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn create(pool: &SqlitePool, data: &CreateTaskRelationshipType) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        
        // Validate directional requirements
        if data.is_directional && (data.forward_label.is_none() || data.reverse_label.is_none()) {
            return Err(sqlx::Error::Protocol(
                "Directional relationship types must have both forward_label and reverse_label".into(),
            ));
        }

        // Validate blocking requirements
        let blocking_disabled_json = data.blocking_disabled_statuses.as_ref().map(|v| serde_json::to_string(v).unwrap());
        let blocking_source_json = data.blocking_source_statuses.as_ref().map(|v| serde_json::to_string(v).unwrap());
        
        if data.enforces_blocking && (blocking_disabled_json.is_none() || blocking_source_json.is_none()) {
            return Err(sqlx::Error::Protocol(
                "Blocking relationship types must have both blocking_disabled_statuses and blocking_source_statuses".into(),
            ));
        }

        sqlx::query_as!(
            TaskRelationshipType,
            r#"INSERT INTO task_relationship_types (
                id, type_name, display_name, description, is_directional, 
                forward_label, reverse_label, enforces_blocking, 
                blocking_disabled_statuses, blocking_source_statuses
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING 
                id as "id!: Uuid", 
                type_name, 
                display_name, 
                description,
                is_system as "is_system!: i64",
                is_directional as "is_directional!: i64",
                forward_label,
                reverse_label,
                enforces_blocking as "enforces_blocking!: i64",
                blocking_disabled_statuses,
                blocking_source_statuses,
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.type_name,
            data.display_name,
            data.description,
            data.is_directional as i64,
            data.forward_label,
            data.reverse_label,
            data.enforces_blocking as i64,
            blocking_disabled_json,
            blocking_source_json
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateTaskRelationshipType,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let type_name = data.type_name.as_ref().unwrap_or(&existing.type_name);
        let display_name = data.display_name.as_ref().unwrap_or(&existing.display_name);
        let description = data.description.as_ref().or(existing.description.as_ref());
        let is_directional = data.is_directional.unwrap_or(existing.is_directional);
        let forward_label = data.forward_label.as_ref().or(existing.forward_label.as_ref());
        let reverse_label = data.reverse_label.as_ref().or(existing.reverse_label.as_ref());
        let enforces_blocking = data.enforces_blocking.unwrap_or(existing.enforces_blocking);

        // Validate directional requirements
        if is_directional && (forward_label.is_none() || reverse_label.is_none()) {
            return Err(sqlx::Error::Protocol(
                "Directional relationship types must have both forward_label and reverse_label".into(),
            ));
        }

        // Handle blocking statuses
        let blocking_disabled_json = match &data.blocking_disabled_statuses {
            Some(v) => Some(serde_json::to_string(v).unwrap()),
            None => existing.blocking_disabled_statuses.clone(),
        };
        let blocking_source_json = match &data.blocking_source_statuses {
            Some(v) => Some(serde_json::to_string(v).unwrap()),
            None => existing.blocking_source_statuses.clone(),
        };

        // Validate blocking requirements
        if enforces_blocking && (blocking_disabled_json.is_none() || blocking_source_json.is_none()) {
            return Err(sqlx::Error::Protocol(
                "Blocking relationship types must have both blocking_disabled_statuses and blocking_source_statuses".into(),
            ));
        }

        sqlx::query_as!(
            TaskRelationshipType,
            r#"UPDATE task_relationship_types
               SET type_name = $2, 
                   display_name = $3, 
                   description = $4,
                   is_directional = $5,
                   forward_label = $6,
                   reverse_label = $7,
                   enforces_blocking = $8,
                   blocking_disabled_statuses = $9,
                   blocking_source_statuses = $10,
                   updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING 
                   id as "id!: Uuid", 
                   type_name, 
                   display_name, 
                   description,
                   is_system as "is_system!: i64",
                   is_directional as "is_directional!: i64",
                   forward_label,
                   reverse_label,
                   enforces_blocking as "enforces_blocking!: i64",
                   blocking_disabled_statuses,
                   blocking_source_statuses,
                   created_at as "created_at!: DateTime<Utc>", 
                   updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            type_name,
            display_name,
            description,
            is_directional as i64,
            forward_label,
            reverse_label,
            enforces_blocking as i64,
            blocking_disabled_json,
            blocking_source_json
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        // Prevent deletion of system types
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        if existing.is_system {
            return Err(sqlx::Error::Protocol(
                "Cannot delete system relationship types".into(),
            ));
        }

        let result = sqlx::query!("DELETE FROM task_relationship_types WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub fn validate_blocking_status(
        &self,
        new_status: &TaskStatus,
        blocking_task_statuses: &[TaskStatus],
    ) -> Result<(), String> {
        if !self.enforces_blocking {
            return Ok(());
        }

        let disabled_statuses = self.blocking_disabled_statuses_vec()
            .map_err(|e| format!("Failed to parse blocking_disabled_statuses: {}", e))?;
        let source_statuses = self.blocking_source_statuses_vec()
            .map_err(|e| format!("Failed to parse blocking_source_statuses: {}", e))?;

        let disabled_statuses = disabled_statuses.unwrap_or_default();
        let source_statuses = source_statuses.unwrap_or_default();

        // Check if new status is in disabled list
        if disabled_statuses.contains(new_status) {
            // Check if any blocking tasks are in source statuses
            let has_blocking = blocking_task_statuses.iter().any(|s| source_statuses.contains(s));
            if has_blocking {
                let disabled_list: Vec<String> = disabled_statuses.iter().map(|s| s.to_string()).collect();
                let source_list: Vec<String> = source_statuses.iter().map(|s| s.to_string()).collect();
                return Err(format!(
                    "Cannot set status to '{}' because task is blocked by tickets in statuses: {}. Blocked statuses: {}",
                    new_status,
                    source_list.join(", "),
                    disabled_list.join(", ")
                ));
            }
        }

        Ok(())
    }
}

