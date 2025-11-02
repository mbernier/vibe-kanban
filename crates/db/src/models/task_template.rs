use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS, schemars::JsonSchema)]
pub struct TaskTemplate {
    pub id: Uuid,
    pub group_id: Option<Uuid>,
    pub template_name: String,
    pub template_title: String,
    pub ticket_title: String,
    pub ticket_description: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, TS, schemars::JsonSchema)]
pub struct CreateTaskTemplate {
    pub group_id: Option<Uuid>,
    pub template_name: String,
    pub template_title: String,
    pub ticket_title: String,
    pub ticket_description: String,
}

#[derive(Debug, Serialize, Deserialize, TS, schemars::JsonSchema)]
pub struct UpdateTaskTemplate {
    pub group_id: Option<Uuid>,
    pub template_name: Option<String>,
    pub template_title: Option<String>,
    pub ticket_title: Option<String>,
    pub ticket_description: Option<String>,
}

impl TaskTemplate {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskTemplate,
            r#"SELECT 
                id as "id!: Uuid", 
                group_id as "group_id: Uuid",
                template_name,
                template_title,
                ticket_title,
                ticket_description,
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_templates
               ORDER BY template_title ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskTemplate,
            r#"SELECT 
                id as "id!: Uuid", 
                group_id as "group_id: Uuid",
                template_name,
                template_title,
                ticket_title,
                ticket_description,
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_templates
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_template_name(
        pool: &SqlitePool,
        template_name: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskTemplate,
            r#"SELECT 
                id as "id!: Uuid", 
                group_id as "group_id: Uuid",
                template_name,
                template_title,
                ticket_title,
                ticket_description,
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_templates
               WHERE template_name = $1"#,
            template_name
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_group_id(
        pool: &SqlitePool,
        group_id: Option<Uuid>,
    ) -> Result<Vec<Self>, sqlx::Error> {
        if let Some(group_id) = group_id {
            sqlx::query_as!(
                TaskTemplate,
                r#"SELECT 
                    id as "id!: Uuid", 
                    group_id as "group_id: Uuid",
                    template_name,
                    template_title,
                    ticket_title,
                    ticket_description,
                    created_at as "created_at!: DateTime<Utc>", 
                    updated_at as "updated_at!: DateTime<Utc>"
                   FROM task_templates
                   WHERE group_id = $1
                   ORDER BY template_title ASC"#,
                group_id
            )
            .fetch_all(pool)
            .await
        } else {
            sqlx::query_as!(
                TaskTemplate,
                r#"SELECT 
                    id as "id!: Uuid", 
                    group_id as "group_id: Uuid",
                    template_name,
                    template_title,
                    ticket_title,
                    ticket_description,
                    created_at as "created_at!: DateTime<Utc>", 
                    updated_at as "updated_at!: DateTime<Utc>"
                   FROM task_templates
                   WHERE group_id IS NULL
                   ORDER BY template_title ASC"#
            )
            .fetch_all(pool)
            .await
        }
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateTaskTemplate,
    ) -> Result<Self, sqlx::Error> {
        // Validate template_name uniqueness
        if Self::find_by_template_name(pool, &data.template_name).await?.is_some() {
            return Err(sqlx::Error::Protocol(
                format!("Template with name '{}' already exists", data.template_name).into(),
            ));
        }

        let id = Uuid::new_v4();
        sqlx::query_as!(
            TaskTemplate,
            r#"INSERT INTO task_templates (id, group_id, template_name, template_title, ticket_title, ticket_description)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING 
                   id as "id!: Uuid", 
                   group_id as "group_id: Uuid",
                   template_name,
                   template_title,
                   ticket_title,
                   ticket_description,
                   created_at as "created_at!: DateTime<Utc>", 
                   updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.group_id,
            data.template_name,
            data.template_title,
            data.ticket_title,
            data.ticket_description
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateTaskTemplate,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        // Validate template_name uniqueness if changed
        if let Some(ref template_name) = data.template_name {
            if template_name != &existing.template_name {
                if Self::find_by_template_name(pool, template_name).await?.is_some() {
                    return Err(sqlx::Error::Protocol(
                        format!("Template with name '{}' already exists", template_name).into(),
                    ));
                }
            }
        }

        let group_id = data.group_id.or(existing.group_id);
        let template_name = data.template_name.as_ref().unwrap_or(&existing.template_name);
        let template_title = data.template_title.as_ref().unwrap_or(&existing.template_title);
        let ticket_title = data.ticket_title.as_ref().unwrap_or(&existing.ticket_title);
        let ticket_description = data.ticket_description.as_ref().unwrap_or(&existing.ticket_description);

        sqlx::query_as!(
            TaskTemplate,
            r#"UPDATE task_templates
               SET group_id = $2, 
                   template_name = $3, 
                   template_title = $4,
                   ticket_title = $5,
                   ticket_description = $6,
                   updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING 
                   id as "id!: Uuid", 
                   group_id as "group_id: Uuid",
                   template_name,
                   template_title,
                   ticket_title,
                   ticket_description,
                   created_at as "created_at!: DateTime<Utc>", 
                   updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            group_id,
            template_name,
            template_title,
            ticket_title,
            ticket_description
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM task_templates WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}

