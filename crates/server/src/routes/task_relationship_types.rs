use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    middleware::from_fn_with_state,
    response::Json as ResponseJson,
    routing::{get, post, put, delete},
};
use db::models::task_relationship_type::{
    CreateTaskRelationshipType, TaskRelationshipType, UpdateTaskRelationshipType,
};
use deployment::Deployment;
use serde::Deserialize;
use ts_rs::TS;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::{DeploymentImpl, error::ApiError};

#[derive(Deserialize, TS)]
pub struct RelationshipTypeSearchParams {
    #[serde(default)]
    pub search: Option<String>,
}

async fn load_relationship_type_middleware(
    axum::extract::Path(type_id): axum::extract::Path<Uuid>,
    State(deployment): State<DeploymentImpl>,
    request: axum::http::Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> Result<axum::response::Response, ApiError> {
    let relationship_type = TaskRelationshipType::find_by_id(&deployment.db().pool, type_id)
        .await?
        .ok_or(ApiError::Database(sqlx::Error::RowNotFound))?;

    let mut request = request;
    request.extensions_mut().insert(relationship_type);
    Ok(next.run(request).await)
}

pub async fn get_relationship_types(
    State(deployment): State<DeploymentImpl>,
    Query(params): Query<RelationshipTypeSearchParams>,
) -> Result<ResponseJson<ApiResponse<Vec<TaskRelationshipType>>>, ApiError> {
    let mut types = TaskRelationshipType::find_all(&deployment.db().pool).await?;

    // Filter by search query if provided
    if let Some(search_query) = params.search {
        let search_lower = search_query.to_lowercase();
        types.retain(|t| {
            t.type_name.to_lowercase().contains(&search_lower)
                || t.display_name.to_lowercase().contains(&search_lower)
        });
    }

    Ok(ResponseJson(ApiResponse::success(types)))
}

pub async fn get_relationship_type(
    Extension(relationship_type): Extension<TaskRelationshipType>,
) -> Result<ResponseJson<ApiResponse<TaskRelationshipType>>, ApiError> {
    Ok(ResponseJson(ApiResponse::success(relationship_type)))
}

pub async fn create_relationship_type(
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<CreateTaskRelationshipType>,
) -> Result<ResponseJson<ApiResponse<TaskRelationshipType>>, ApiError> {
    // Validate directional requirements
    if payload.is_directional && (payload.forward_label.is_none() || payload.reverse_label.is_none()) {
        return Err(ApiError::BadRequest(
            "Directional relationship types must have both forward_label and reverse_label".to_string(),
        ));
    }

    // Validate blocking requirements
    if payload.enforces_blocking && (payload.blocking_disabled_statuses.is_none() || payload.blocking_source_statuses.is_none()) {
        return Err(ApiError::BadRequest(
            "Blocking relationship types must have both blocking_disabled_statuses and blocking_source_statuses".to_string(),
        ));
    }

    let relationship_type = TaskRelationshipType::create(&deployment.db().pool, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "relationship_type_created",
            serde_json::json!({
                "type_id": relationship_type.id.to_string(),
                "type_name": relationship_type.type_name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(relationship_type)))
}

pub async fn update_relationship_type(
    Extension(existing_type): Extension<TaskRelationshipType>,
    State(deployment): State<DeploymentImpl>,
    Json(payload): Json<UpdateTaskRelationshipType>,
) -> Result<ResponseJson<ApiResponse<TaskRelationshipType>>, ApiError> {
    // Validate directional requirements if being set
    if let Some(is_directional) = payload.is_directional {
        let forward_label = payload.forward_label.as_ref().or(existing_type.forward_label.as_ref());
        let reverse_label = payload.reverse_label.as_ref().or(existing_type.reverse_label.as_ref());
        if is_directional && (forward_label.is_none() || reverse_label.is_none()) {
            return Err(ApiError::BadRequest(
                "Directional relationship types must have both forward_label and reverse_label".to_string(),
            ));
        }
    }

    // Validate blocking requirements if being set
    if let Some(enforces_blocking) = payload.enforces_blocking {
        let disabled_statuses = payload.blocking_disabled_statuses.as_ref()
            .or_else(|| existing_type.blocking_disabled_statuses.as_ref().and_then(|s| serde_json::from_str::<Vec<String>>(s).ok()));
        let source_statuses = payload.blocking_source_statuses.as_ref()
            .or_else(|| existing_type.blocking_source_statuses.as_ref().and_then(|s| serde_json::from_str::<Vec<String>>(s).ok()));
        if enforces_blocking && (disabled_statuses.is_none() || source_statuses.is_none()) {
            return Err(ApiError::BadRequest(
                "Blocking relationship types must have both blocking_disabled_statuses and blocking_source_statuses".to_string(),
            ));
        }
    }

    let updated_type = TaskRelationshipType::update(&deployment.db().pool, existing_type.id, &payload).await?;

    deployment
        .track_if_analytics_allowed(
            "relationship_type_updated",
            serde_json::json!({
                "type_id": updated_type.id.to_string(),
                "type_name": updated_type.type_name,
            }),
        )
        .await;

    Ok(ResponseJson(ApiResponse::success(updated_type)))
}

pub async fn delete_relationship_type(
    Extension(relationship_type): Extension<TaskRelationshipType>,
    State(deployment): State<DeploymentImpl>,
) -> Result<ResponseJson<ApiResponse<()>>, ApiError> {
    let rows_affected = TaskRelationshipType::delete(&deployment.db().pool, relationship_type.id).await?;
    if rows_affected == 0 {
        Err(ApiError::Database(sqlx::Error::RowNotFound))
    } else {
        deployment
            .track_if_analytics_allowed(
                "relationship_type_deleted",
                serde_json::json!({
                    "type_id": relationship_type.id.to_string(),
                    "type_name": relationship_type.type_name,
                }),
            )
            .await;
        Ok(ResponseJson(ApiResponse::success(())))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    let type_router = Router::new()
        .route("/", get(get_relationship_type).put(update_relationship_type).delete(delete_relationship_type))
        .layer(from_fn_with_state(deployment.clone(), load_relationship_type_middleware));

    let inner = Router::new()
        .route("/", get(get_relationship_types).post(create_relationship_type))
        .nest("/{type_id}", type_router);

    Router::new().nest("/task-relationship-types", inner)
}

