use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post, put, delete},
};
use db::models::task_template_group::{
    CreateTaskTemplateGroup, TaskTemplateGroup, TaskTemplateGroupWithChildren,
    UpdateTaskTemplateGroup,
};
use deployment::Deployment;
use serde::Deserialize;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_template_group_middleware};

#[derive(Deserialize, TS)]
pub struct TaskTemplateGroupSearchParams {
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub parent_id: Option<Uuid>,
    #[serde(default)]
    pub hierarchical: Option<bool>,
}

pub async fn get_task_template_groups(
    State(deployment): State<DeploymentImpl>,
    Query(params): Query<TaskTemplateGroupSearchParams>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskTemplateGroupWithChildren>>>, ApiError> {
    if params.hierarchical.unwrap_or(false) {
        let hierarchy = TaskTemplateGroup::find_hierarchy(&deployment.db().pool).await?;
        Ok(ResponseJson(ApiResponse::success(hierarchy)))
    } else {
        let groups = if let Some(parent_id) = params.parent_id {
            TaskTemplateGroup::find_by_parent_id(&deployment.db().pool, Some(parent_id)).await?
        } else {
            TaskTemplateGroup::find_by_parent_id(&deployment.db().pool, None).await?
        };

        let mut filtered_groups = groups;

        // Filter by search query if provided
        if let Some(search_query) = params.search {
            let search_lower = search_query.to_lowercase();
            filtered_groups.retain(|g| g.name.to_lowercase().contains(&search_lower));
        }

        // Convert to flat list with empty children
        let result: Vec<TaskTemplateGroupWithChildren> = filtered_groups
            .into_iter()
            .map(|g| TaskTemplateGroupWithChildren {
                group: g,
                children: Vec::new(),
            })
            .collect();

        Ok(ResponseJson(ApiResponse::success(result)))
    }
}

pub async fn get_task_template_group(
    Extension(group): Extension<TaskTemplateGroup>,
) -> Result<ResponseJson<ApiResponse<TaskTemplateGroup>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(group)))
}

pub async fn create_task_template_group(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskTemplateGroup>,
) -> Result<ResponseJson<ApiResponse<TaskTemplateGroup>>, ApiError> {
    // Validate depth
    TaskTemplateGroup::validate_depth(&deployment.db().pool, payload.parent_group_id).await
        .map_err(|e| ApiError::BadRequest(format!("{}", e)))?;

    let group = TaskTemplateGroup::create(&deployment.db().pool, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "task_template_group_created",
            serde_json::json!({
                "group_id": group.id.to_string(),
                "group_name": group.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(group)))
}

pub async fn update_task_template_group(
    Extension(existing_group): Extension<TaskTemplateGroup>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateTaskTemplateGroup>,
) -> Result<ResponseJson<ApiResponse<TaskTemplateGroup>>, ApiError> {
    let updated_group = TaskTemplateGroup::update(&deployment.db().pool, existing_group.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "task_template_group_updated",
            serde_json::json!({
                "group_id": updated_group.id.to_string(),
                "group_name": updated_group.name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_group)))
}

pub async fn delete_task_template_group(
    Extension(group): Extension<TaskTemplateGroup>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = TaskTemplateGroup::delete(&deployment.db().pool, group.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let group_router = Router::new()
        .route("/", get(get_task_template_group).put(update_task_template_group).delete(delete_task_template_group))
        .layer(from_fn_with_state(deployment.clone(), load_template_group_middleware));

    let inner = Router::new()
        .route("/", get(get_task_template_groups).post(create_task_template_group))
        .nest("/{group_id}", group_router);

    Router::new().nest("/task-template-groups", inner)
}

