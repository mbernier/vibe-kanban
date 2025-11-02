mod helpers;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use db::models::{
    task_relationship::{CreateTaskRelationship, TaskRelationship, TaskRelationshipGrouped},
    task_relationship_type::TaskRelationshipType,
};
use deployment::Deployment;
use serde_json::json;
use tower::ServiceExt;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::helpers::*;
use server::routes;

#[tokio::test]
async fn test_create_relationship_type() {
    let (_deployment, _temp_dir) = create_test_deployment().await;
    let deployment = _deployment;
    let app = routes::router_for_testing(deployment.clone());

    let payload = json!({
        "type_name": "test_type",
        "display_name": "Test Type",
        "description": "Test Description",
        "is_directional": true,
        "forward_label": "forward",
        "reverse_label": "reverse",
        "enforces_blocking": false
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/task-relationship-types")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let api_response: ApiResponse<TaskRelationshipType> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    assert_eq!(data.type_name, "test_type");
    assert_eq!(data.display_name, "Test Type");
}

#[tokio::test]
async fn test_create_directional_relationship_type_without_labels() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    let payload = json!({
        "type_name": "test_type",
        "display_name": "Test Type",
        "is_directional": true,
        "forward_label": "forward",
        // Missing reverse_label
        "enforces_blocking": false
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/task-relationship-types")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_get_relationship_types() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    // Create a relationship type via database
    create_test_relationship_type(&deployment.db().pool, "test_type", true, false).await;

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/task-relationship-types")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let api_response: ApiResponse<Vec<TaskRelationshipType>> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    assert!(!data.is_empty());
}

#[tokio::test]
async fn test_get_relationship_type_by_id() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    let rel_type = create_test_relationship_type(&deployment.db().pool, "test_type", true, false).await;

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/task-relationship-types/{}", rel_type.id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let api_response: ApiResponse<TaskRelationshipType> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    assert_eq!(data.id, rel_type.id);
}

#[tokio::test]
async fn test_update_relationship_type() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    let rel_type = create_test_relationship_type(&deployment.db().pool, "test_type", true, false).await;

    let payload = json!({
        "display_name": "Updated Display Name"
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/task-relationship-types/{}", rel_type.id))
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let api_response: ApiResponse<TaskRelationshipType> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    assert_eq!(data.display_name, "Updated Display Name");
}

#[tokio::test]
async fn test_delete_relationship_type() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    let rel_type = create_test_relationship_type(&deployment.db().pool, "test_type", true, false).await;

    let response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/api/task-relationship-types/{}", rel_type.id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_create_task_relationship() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    let project = create_test_project(&deployment.db().pool).await;
    let task1 = create_test_task(&deployment.db().pool, project.id).await;
    let task2 = create_test_task(&deployment.db().pool, project.id).await;
    let rel_type = create_test_relationship_type(&deployment.db().pool, "test_type", true, false).await;

    let payload = json!({
        "target_task_id": task2.id,
        "relationship_type": "test_type",
        "note": "Test note"
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/tasks/{}/relationships", task1.id))
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let api_response: ApiResponse<TaskRelationship> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    assert_eq!(data.source_task_id, task1.id);
    assert_eq!(data.target_task_id, task2.id);
    assert_eq!(data.note, Some("Test note".to_string()));
}

#[tokio::test]
async fn test_create_self_referential_relationship() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    let project = create_test_project(&deployment.db().pool).await;
    let task = create_test_task(&deployment.db().pool, project.id).await;
    let _rel_type = create_test_relationship_type(&deployment.db().pool, "test_type", true, false).await;

    let payload = json!({
        "target_task_id": task.id, // Same as source
        "relationship_type": "test_type"
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/tasks/{}/relationships", task.id))
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    // Should fail validation
    assert_ne!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_get_task_relationships() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    let project = create_test_project(&deployment.db().pool).await;
    let task1 = create_test_task(&deployment.db().pool, project.id).await;
    let task2 = create_test_task(&deployment.db().pool, project.id).await;
    let rel_type = create_test_relationship_type(&deployment.db().pool, "test_type", true, false).await;

    // Create a relationship
    TaskRelationship::create(
        &deployment.db().pool,
        task1.id,
        &CreateTaskRelationship {
            target_task_id: task2.id,
            relationship_type_id: Some(rel_type.id),
            relationship_type: None,
            data: None,
            note: Some("Test note".to_string()),
        },
    )
    .await
    .unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/tasks/{}/relationships", task1.id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let api_response: ApiResponse<Vec<TaskRelationshipGrouped>> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    assert!(!data.is_empty());
    assert_eq!(data[0].forward.len(), 1);
}

#[tokio::test]
async fn test_update_task_relationship() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    let project = create_test_project(&deployment.db().pool).await;
    let task1 = create_test_task(&deployment.db().pool, project.id).await;
    let task2 = create_test_task(&deployment.db().pool, project.id).await;
    let rel_type = create_test_relationship_type(&deployment.db().pool, "test_type", true, false).await;

    let relationship = TaskRelationship::create(
        &deployment.db().pool,
        task1.id,
        &CreateTaskRelationship {
            target_task_id: task2.id,
            relationship_type_id: Some(rel_type.id),
            relationship_type: None,
            data: None,
            note: Some("Original note".to_string()),
        },
    )
    .await
    .unwrap();

    let payload = json!({
        "note": "Updated note"
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!(
                    "/api/tasks/{}/relationships/{}",
                    task1.id, relationship.id
                ))
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let api_response: ApiResponse<TaskRelationship> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    assert_eq!(data.note, Some("Updated note".to_string()));
}

#[tokio::test]
async fn test_delete_task_relationship() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    let project = create_test_project(&deployment.db().pool).await;
    let task1 = create_test_task(&deployment.db().pool, project.id).await;
    let task2 = create_test_task(&deployment.db().pool, project.id).await;
    let rel_type = create_test_relationship_type(&deployment.db().pool, "test_type", true, false).await;

    let relationship = TaskRelationship::create(
        &deployment.db().pool,
        task1.id,
        &CreateTaskRelationship {
            target_task_id: task2.id,
            relationship_type_id: Some(rel_type.id),
            relationship_type: None,
            data: None,
            note: None,
        },
    )
    .await
    .unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!(
                    "/api/tasks/{}/relationships/{}",
                    task1.id, relationship.id
                ))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    // Debug: Check response body if status is not OK
    let status = response.status();
    if status != StatusCode::OK {
        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body_str = String::from_utf8_lossy(&body);
        panic!("Expected 200 but got {}: {}", status, body_str);
    }
    
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
async fn test_relationship_search() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    create_test_relationship_type(&deployment.db().pool, "test_context", true, false).await;
    create_test_relationship_type(&deployment.db().pool, "test_blocked", true, true).await;

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/task-relationship-types?search=test_context")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let api_response: ApiResponse<Vec<TaskRelationshipType>> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    assert!(data.iter().any(|t| t.type_name == "test_context"));
    assert!(!data.iter().any(|t| t.type_name == "test_blocked"));
}

