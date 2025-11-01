use axum::{
    Extension, Json, Router,
    extract::{Path, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post, put, delete},
};
use db::models::{
    task::Task,
    task_relationship::{
        CreateTaskRelationship, TaskRelationship, TaskRelationshipGrouped, UpdateTaskRelationship,
    },
};
use deployment::Deployment;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError, middleware::load_task_middleware};

pub async fn get_task_relationships(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskRelationshipGrouped>>>, ApiError> {
    let relationships = TaskRelationship::find_by_task(&deployment.db().pool, task.id).await?;
    Ok(ResponseJson(ApiResponse::success(relationships)))
}

pub async fn create_task_relationship(
    Extension(task): Extension<Task>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskRelationship>,
) -> Result<ResponseJson<ApiResponse<TaskRelationship>>, ApiError> {
    // Verify target task exists
    let _target_task = Task::find_by_id(&deployment.db().pool, payload.target_task_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    // Verify relationship type exists and check blocking rules if needed
    let rel_type = db::models::task_relationship_type::TaskRelationshipType::find_by_id(
        &deployment.db().pool,
        payload.relationship_type_id,
    )
    .await?
    .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    // Create relationship
    let relationship = TaskRelationship::create(&deployment.db().pool, task.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "task_relationship_created",
            serde_json::json!({
                "relationship_id": relationship.id.to_string(),
                "task_id": task.id.to_string(),
                "target_task_id": payload.target_task_id.to_string(),
                "relationship_type_id": payload.relationship_type_id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(relationship)))
}

pub async fn update_task_relationship(
    Extension(task): Extension<Task>,
    Extension(relationship): Extension<TaskRelationship>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateTaskRelationship>,
) -> Result<ResponseJson<ApiResponse<TaskRelationship>>, ApiError> {
    // Verify target task exists if being changed
    if let Some(target_task_id) = payload.target_task_id {
        let _target_task = Task::find_by_id(&deployment.db().pool, target_task_id)
            .await?
            .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;
    }

    // Verify relationship type exists if being changed
    if let Some(relationship_type_id) = payload.relationship_type_id {
        let _rel_type = db::models::task_relationship_type::TaskRelationshipType::find_by_id(
            &deployment.db().pool,
            relationship_type_id,
        )
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;
    }

    let updated_relationship = TaskRelationship::update(&deployment.db().pool, relationship.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "task_relationship_updated",
            serde_json::json!({
                "relationship_id": relationship.id.to_string(),
                "task_id": task.id.to_string(),
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_relationship)))
}

pub async fn delete_task_relationship(
    Extension(task): Extension<Task>,
    Extension(relationship): Extension<TaskRelationship>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = TaskRelationship::delete(&deployment.db().pool, relationship.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        deployment
            .track_if_analytics_allowed(
                "task_relationship_deleted",
                serde_json::json!({
                    "relationship_id": relationship.id.to_string(),
                    "task_id": task.id.to_string(),
                }),
            )
            .await;
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    async fn load_relationship_middleware_inner(
        Path((task_id, relationship_id)): Path<(Uuid, Uuid)>,
        State(deployment): State<DeploymentImpl>,
        request: axum::http::Request<axum::body::Body>,
        next: axum::middleware::Next,
    ) -> Result<axum::response::Response, ApiError> {
        // Verify task exists and relationship belongs to task
        let _task = Task::find_by_id(&deployment.db().pool, task_id)
            .await?
            .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

        let relationship = TaskRelationship::find_by_id(&deployment.db().pool, relationship_id)
            .await?
            .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

        if relationship.source_task_id != task_id && relationship.target_task_id != task_id {
            return Err(ApiError::BadRequest(
                "Relationship does not belong to this task".to_string(),
            ));
        }

        let mut request = request;
        request.extensions_mut().insert(relationship);
        Ok(next.run(request).await)
    }

    let relationship_id_router = Router::new()
        .route("/", put(update_task_relationship).delete(delete_task_relationship))
        .layer(from_fn_with_state(deployment.clone(), load_relationship_middleware_inner));

    let inner = Router::new()
        .route("/", get(get_task_relationships).post(create_task_relationship))
        .nest("/{relationship_id}", relationship_id_router)
        .layer(from_fn_with_state(deployment.clone(), load_task_middleware));

    Router::new().nest("/tasks/{task_id}/relationships", inner)
}

