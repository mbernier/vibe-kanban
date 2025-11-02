use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post, put, delete},
};
use db::models::task_template::{
    CreateTaskTemplate, TaskTemplate, UpdateTaskTemplate,
};
use deployment::Deployment;
use serde::Deserialize;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_template_middleware};

#[derive(Deserialize, TS)]
pub struct TaskTemplateSearchParams {
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub group_id: Option<Uuid>,
}

pub async fn get_task_templates(
    State(deployment): State<DeploymentImpl>,
    Query(params): Query<TaskTemplateSearchParams>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskTemplate>>>, ApiError> {
    let templates = if let Some(group_id) = params.group_id {
        TaskTemplate::find_by_group_id(&deployment.db().pool, Some(group_id)).await?
    } else {
        TaskTemplate::find_all(&deployment.db().pool).await?
    };

    let mut filtered_templates = templates;

    // Filter by search query if provided
    if let Some(search_query) = params.search {
        let search_lower = search_query.to_lowercase();
        filtered_templates.retain(|t| {
            t.template_name.to_lowercase().contains(&search_lower)
                || t.template_title.to_lowercase().contains(&search_lower)
                || t.ticket_title.to_lowercase().contains(&search_lower)
        });
    }

    Ok(ResponseJson(ApiResponse::success(filtered_templates)))
}

pub async fn get_task_template(
    Extension(template): Extension<TaskTemplate>,
) -> Result<ResponseJson<ApiResponse<TaskTemplate>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(template)))
}

pub async fn create_task_template(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskTemplate>,
) -> Result<ResponseJson<ApiResponse<TaskTemplate>>, ApiError> {
    let template = TaskTemplate::create(&deployment.db().pool, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "task_template_created",
            serde_json::json!({
                "template_id": template.id.to_string(),
                "template_name": template.template_name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(template)))
}

pub async fn update_task_template(
    Extension(existing_template): Extension<TaskTemplate>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateTaskTemplate>,
) -> Result<ResponseJson<ApiResponse<TaskTemplate>>, ApiError> {
    let updated_template = TaskTemplate::update(&deployment.db().pool, existing_template.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "task_template_updated",
            serde_json::json!({
                "template_id": updated_template.id.to_string(),
                "template_name": updated_template.template_name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_template)))
}

pub async fn delete_task_template(
    Extension(template): Extension<TaskTemplate>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = TaskTemplate::delete(&deployment.db().pool, template.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let template_router = Router::new()
        .route("/", get(get_task_template).put(update_task_template).delete(delete_task_template))
        .layer(from_fn_with_state(deployment.clone(), load_template_middleware));

    let inner = Router::new()
        .route("/", get(get_task_templates).post(create_task_template))
        .nest("/{template_id}", template_router);

    Router::new().nest("/task-templates", inner)
}

