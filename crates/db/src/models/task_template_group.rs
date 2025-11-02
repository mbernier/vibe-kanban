use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS, schemars::JsonSchema)]
pub struct TaskTemplateGroup {
    pub id: Uuid,
    pub name: String,
    pub parent_group_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, TS, schemars::JsonSchema)]
pub struct CreateTaskTemplateGroup {
    pub name: String,
    pub parent_group_id: Option<Uuid>,
}

#[derive(Debug, Serialize, Deserialize, TS, schemars::JsonSchema)]
pub struct UpdateTaskTemplateGroup {
    pub name: Option<String>,
    pub parent_group_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, schemars::JsonSchema)]
pub struct TaskTemplateGroupWithChildren {
    #[serde(flatten)]
    #[ts(flatten)]
    pub group: TaskTemplateGroup,
    pub children: Vec<TaskTemplateGroupWithChildren>,
}

impl TaskTemplateGroup {
    pub async fn find_all(pool: &SqlitePool) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskTemplateGroup,
            r#"SELECT 
                id as "id!: Uuid", 
                name,
                parent_group_id as "parent_group_id: Uuid",
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_template_groups
               ORDER BY name ASC"#
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &SqlitePool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            TaskTemplateGroup,
            r#"SELECT 
                id as "id!: Uuid", 
                name,
                parent_group_id as "parent_group_id: Uuid",
                created_at as "created_at!: DateTime<Utc>", 
                updated_at as "updated_at!: DateTime<Utc>"
               FROM task_template_groups
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_parent_id(
        pool: &SqlitePool,
        parent_id: Option<Uuid>,
    ) -> Result<Vec<Self>, sqlx::Error> {
        if let Some(parent_id) = parent_id {
            sqlx::query_as!(
                TaskTemplateGroup,
                r#"SELECT 
                    id as "id!: Uuid", 
                    name,
                    parent_group_id as "parent_group_id: Uuid",
                    created_at as "created_at!: DateTime<Utc>", 
                    updated_at as "updated_at!: DateTime<Utc>"
                   FROM task_template_groups
                   WHERE parent_group_id = $1
                   ORDER BY name ASC"#,
                parent_id
            )
            .fetch_all(pool)
            .await
        } else {
            sqlx::query_as!(
                TaskTemplateGroup,
                r#"SELECT 
                    id as "id!: Uuid", 
                    name,
                    parent_group_id as "parent_group_id: Uuid",
                    created_at as "created_at!: DateTime<Utc>", 
                    updated_at as "updated_at!: DateTime<Utc>"
                   FROM task_template_groups
                   WHERE parent_group_id IS NULL
                   ORDER BY name ASC"#
            )
            .fetch_all(pool)
            .await
        }
    }

    pub async fn find_hierarchy(pool: &SqlitePool) -> Result<Vec<TaskTemplateGroupWithChildren>, sqlx::Error> {
        let all_groups = Self::find_all(pool).await?;
        
        // Build a map of groups by ID
        let mut groups_map: std::collections::HashMap<Uuid, TaskTemplateGroupWithChildren> = all_groups
            .into_iter()
            .map(|g| {
                (
                    g.id,
                    TaskTemplateGroupWithChildren {
                        group: g,
                        children: Vec::new(),
                    },
                )
            })
            .collect();

        // Build the tree structure
        let mut root_groups = Vec::new();
        // First, collect all parent-child relationships
        let parent_child_pairs: Vec<(Uuid, Uuid)> = groups_map
            .iter()
            .filter_map(|(id, group_with_children)| {
                group_with_children.group.parent_group_id.map(|parent_id| (*id, parent_id))
            })
            .collect();
        
        // Then, apply the relationships
        for (child_id, parent_id) in parent_child_pairs {
            // Remove the child from the map first to avoid double mutable borrow
            if let Some(child) = groups_map.remove(&child_id) {
                if let Some(parent) = groups_map.get_mut(&parent_id) {
                    parent.children.push(child);
                } else {
                    // Parent not found, treat as root
                    root_groups.push(child);
                }
            }
        }
        
        // Add remaining root groups (those without parents)
        for (_id, group_with_children) in groups_map.into_iter() {
            root_groups.push(group_with_children);
        }

        // Sort children recursively
        fn sort_children(groups: &mut [TaskTemplateGroupWithChildren]) {
            groups.sort_by(|a, b| a.group.name.cmp(&b.group.name));
            for group in groups.iter_mut() {
                sort_children(&mut group.children);
            }
        }
        sort_children(&mut root_groups);

        Ok(root_groups)
    }

    pub async fn get_depth(
        pool: &SqlitePool,
        id: Uuid,
    ) -> Result<usize, sqlx::Error> {
        let mut depth = 0;
        let mut current_id = Some(id);

        loop {
            if let Some(id) = current_id {
                if let Some(group) = Self::find_by_id(pool, id).await? {
                    depth += 1;
                    current_id = group.parent_group_id;
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        Ok(depth)
    }

    pub async fn validate_depth(
        pool: &SqlitePool,
        parent_group_id: Option<Uuid>,
    ) -> Result<(), sqlx::Error> {
        if let Some(parent_id) = parent_group_id {
            let parent_depth = Self::get_depth(pool, parent_id).await?;
            if parent_depth >= 3 {
                return Err(sqlx::Error::Protocol(
                    "Maximum depth of 3 levels exceeded".into(),
                ));
            }
        }
        Ok(())
    }

    pub async fn create(
        pool: &SqlitePool,
        data: &CreateTaskTemplateGroup,
    ) -> Result<Self, sqlx::Error> {
        // Validate depth before creating
        Self::validate_depth(pool, data.parent_group_id).await?;

        let id = Uuid::new_v4();
        sqlx::query_as!(
            TaskTemplateGroup,
            r#"INSERT INTO task_template_groups (id, name, parent_group_id)
               VALUES ($1, $2, $3)
               RETURNING 
                   id as "id!: Uuid", 
                   name,
                   parent_group_id as "parent_group_id: Uuid",
                   created_at as "created_at!: DateTime<Utc>", 
                   updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.name,
            data.parent_group_id
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &SqlitePool,
        id: Uuid,
        data: &UpdateTaskTemplateGroup,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        // Prevent circular references
        if let Some(new_parent_id) = data.parent_group_id {
            if new_parent_id == id {
                return Err(sqlx::Error::Protocol(
                    "Cannot set group as its own parent".into(),
                ));
            }

            // Check if new parent is a descendant of this group
            let mut check_id = Some(new_parent_id);
            while let Some(check) = check_id {
                if check == id {
                    return Err(sqlx::Error::Protocol(
                        "Cannot create circular reference".into(),
                    ));
                }
                if let Some(parent_group) = Self::find_by_id(pool, check).await? {
                    check_id = parent_group.parent_group_id;
                } else {
                    break;
                }
            }
        }

        // Validate depth
        let parent_id = data.parent_group_id.or(existing.parent_group_id);
        Self::validate_depth(pool, parent_id).await?;

        let name = data.name.as_ref().unwrap_or(&existing.name);
        let parent_group_id = data.parent_group_id.or(existing.parent_group_id);

        sqlx::query_as!(
            TaskTemplateGroup,
            r#"UPDATE task_template_groups
               SET name = $2, parent_group_id = $3, updated_at = datetime('now', 'subsec')
               WHERE id = $1
               RETURNING 
                   id as "id!: Uuid", 
                   name,
                   parent_group_id as "parent_group_id: Uuid",
                   created_at as "created_at!: DateTime<Utc>", 
                   updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            name,
            parent_group_id
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &SqlitePool, id: Uuid) -> Result<u64, sqlx::Error> {
        // Check if group has children
        let children = Self::find_by_parent_id(pool, Some(id)).await?;
        if !children.is_empty() {
            return Err(sqlx::Error::Protocol(
                "Cannot delete group with child groups".into(),
            ));
        }

        // Check if group has templates (using raw query to avoid circular dependency)
        let template_count = sqlx::query!(
            "SELECT COUNT(*) as count FROM task_templates WHERE group_id = $1",
            id
        )
        .fetch_one(pool)
        .await?;
        if template_count.count > 0 {
            return Err(sqlx::Error::Protocol(
                "Cannot delete group with templates".into(),
            ));
        }

        let result = sqlx::query!("DELETE FROM task_template_groups WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}

