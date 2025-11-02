mod helpers;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use db::models::{
    task_template::{CreateTaskTemplate, TaskTemplate},
    task_template_group::{CreateTaskTemplateGroup, TaskTemplateGroup},
};
use deployment::Deployment;
use serde_json::json;
use tower::ServiceExt;
use utils::response::ApiResponse;
use uuid::Uuid;

use crate::helpers::*;
use server::routes;

// Test Isolation: Each test creates its own isolated deployment with a fresh database
// via `create_test_deployment()`. The TempDir is kept alive (via `_temp_dir`) to ensure
// the database file persists during the test execution. When the test completes, the
// TempDir is automatically cleaned up, ensuring no test data leaks between tests.

#[tokio::test]
async fn test_create_template_group() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    let payload = json!({
        "name": "Bug Reports",
        "parent_group_id": null
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/task-template-groups")
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
    let api_response: ApiResponse<TaskTemplateGroup> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    assert_eq!(data.name, "Bug Reports");
    assert_eq!(data.parent_group_id, None);
}

#[tokio::test]
async fn test_create_template_group_with_parent() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    // Create parent group
    let parent = TaskTemplateGroup::create(
        &deployment.db().pool,
        &CreateTaskTemplateGroup {
            name: "Parent Group".to_string(),
            parent_group_id: None,
        },
    )
    .await
    .unwrap();

    let payload = json!({
        "name": "Child Group",
        "parent_group_id": parent.id
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/task-template-groups")
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
    let api_response: ApiResponse<TaskTemplateGroup> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    assert_eq!(data.name, "Child Group");
    assert_eq!(data.parent_group_id, Some(parent.id));
}

#[tokio::test]
async fn test_get_template_groups() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    // Create test groups
    TaskTemplateGroup::create(
        &deployment.db().pool,
        &CreateTaskTemplateGroup {
            name: "Group 1".to_string(),
            parent_group_id: None,
        },
    )
    .await
    .unwrap();

    TaskTemplateGroup::create(
        &deployment.db().pool,
        &CreateTaskTemplateGroup {
            name: "Group 2".to_string(),
            parent_group_id: None,
        },
    )
    .await
    .unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/task-template-groups")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let api_response: ApiResponse<Vec<TaskTemplateGroup>> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    assert!(data.len() >= 2);
}

#[tokio::test]
async fn test_create_template() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    let payload = json!({
        "group_id": null,
        "template_name": "bug_report",
        "template_title": "Bug Report Template",
        "ticket_title": "Bug: {{title}}",
        "ticket_description": "## Description\n\n{{description}}\n\n## Steps to Reproduce\n\n1. Step 1\n2. Step 2"
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/task-templates")
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
    let api_response: ApiResponse<TaskTemplate> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    assert_eq!(data.template_name, "bug_report");
    assert_eq!(data.template_title, "Bug Report Template");
}

#[tokio::test]
async fn test_create_template_with_group() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    // Create a group
    let group = TaskTemplateGroup::create(
        &deployment.db().pool,
        &CreateTaskTemplateGroup {
            name: "Bug Reports".to_string(),
            parent_group_id: None,
        },
    )
    .await
    .unwrap();

    let payload = json!({
        "group_id": group.id,
        "template_name": "critical_bug",
        "template_title": "Critical Bug Template",
        "ticket_title": "CRITICAL: {{title}}",
        "ticket_description": "Critical bug report"
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/task-templates")
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
    let api_response: ApiResponse<TaskTemplate> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    assert_eq!(data.template_name, "critical_bug");
    assert_eq!(data.group_id, Some(group.id));
}

#[tokio::test]
async fn test_get_template_by_id() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    let template = TaskTemplate::create(
        &deployment.db().pool,
        &CreateTaskTemplate {
            group_id: None,
            template_name: "test_template".to_string(),
            template_title: "Test Template".to_string(),
            ticket_title: "Test Title".to_string(),
            ticket_description: "Test Description".to_string(),
        },
    )
    .await
    .unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/task-templates/{}", template.id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let api_response: ApiResponse<TaskTemplate> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    assert_eq!(data.id, template.id);
    assert_eq!(data.template_name, "test_template");
}

#[tokio::test]
async fn test_update_template() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    let template = TaskTemplate::create(
        &deployment.db().pool,
        &CreateTaskTemplate {
            group_id: None,
            template_name: "test_template".to_string(),
            template_title: "Test Template".to_string(),
            ticket_title: "Test Title".to_string(),
            ticket_description: "Test Description".to_string(),
        },
    )
    .await
    .unwrap();

    let payload = json!({
        "template_title": "Updated Template Title",
        "ticket_title": "Updated Ticket Title"
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/task-templates/{}", template.id))
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
    let api_response: ApiResponse<TaskTemplate> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    assert_eq!(data.template_title, "Updated Template Title");
    assert_eq!(data.ticket_title, "Updated Ticket Title");
}

#[tokio::test]
async fn test_delete_template() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    let template = TaskTemplate::create(
        &deployment.db().pool,
        &CreateTaskTemplate {
            group_id: None,
            template_name: "test_template".to_string(),
            template_title: "Test Template".to_string(),
            ticket_title: "Test Title".to_string(),
            ticket_description: "Test Description".to_string(),
        },
    )
    .await
    .unwrap();

    let response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/api/task-templates/{}", template.id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Verify template is deleted
    let result = TaskTemplate::find_by_id(&deployment.db().pool, template.id).await;
    assert!(result.unwrap().is_none());
}

#[tokio::test]
async fn test_delete_group_with_templates() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    let group = TaskTemplateGroup::create(
        &deployment.db().pool,
        &CreateTaskTemplateGroup {
            name: "Test Group".to_string(),
            parent_group_id: None,
        },
    )
    .await
    .unwrap();

    // Create template in group
    TaskTemplate::create(
        &deployment.db().pool,
        &CreateTaskTemplate {
            group_id: Some(group.id),
            template_name: "test_template".to_string(),
            template_title: "Test Template".to_string(),
            ticket_title: "Test Title".to_string(),
            ticket_description: "Test Description".to_string(),
        },
    )
    .await
    .unwrap();

    // Try to delete group - should fail
    let response = app
        .oneshot(
            Request::builder()
                .method("DELETE")
                .uri(format!("/api/task-template-groups/{}", group.id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_template_reference_processing() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router_for_testing(deployment.clone());

    // Create a template
    let template = TaskTemplate::create(
        &deployment.db().pool,
        &CreateTaskTemplate {
            group_id: None,
            template_name: "bug_report".to_string(),
            template_title: "Bug Report Template".to_string(),
            ticket_title: "Bug: {{title}}".to_string(),
            ticket_description: "Bug description".to_string(),
        },
    )
    .await
    .unwrap();

    // Create a project and task
    let project = create_test_project(&deployment.db().pool).await;
    let task = create_test_task(&deployment.db().pool, project.id).await;

    // Update task with template reference
    let update_payload = json!({
        "description": "This task references ~template:bug_report template"
    });

    let response = app
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/tasks/{}", task.id))
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_string(&update_payload).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    // Get task and verify template reference is processed
    let response = app
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/tasks/{}", task.id))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let api_response: ApiResponse<db::models::task::Task> =
        serde_json::from_slice(&body).unwrap();
    assert!(api_response.is_success());
    let data = api_response.into_data().unwrap();
    
    // Verify description contains processed template reference
    assert!(data.description.is_some());
    let description = data.description.unwrap();
    // Should contain markdown link with template metadata
    assert!(description.contains("~template:bug_report"));
    assert!(description.contains("data:template/"));
}
