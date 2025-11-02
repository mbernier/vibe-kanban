mod helpers;

use db::models::task_template::{CreateTaskTemplate, TaskTemplate};
use db::models::task_template_group::{CreateTaskTemplateGroup, TaskTemplateGroup};
use deployment::Deployment;
use rmcp::model::{CallToolResult, Content};
use serde_json::json;
use tokio::net::TcpListener as TokioTcpListener;
use uuid::Uuid;

use crate::helpers::*;
use server::{routes, mcp::task_server::TaskServer};

// Test Isolation: Each test creates its own isolated deployment with a fresh database
// via `create_test_deployment()`. The TempDir is kept alive (via `_temp_dir`) to ensure
// the database file persists during the test execution. Each test also spawns its own
// HTTP server on a random port, ensuring complete isolation between tests. When the test
// completes, both the TempDir and server are cleaned up automatically.

#[tokio::test]
async fn test_mcp_list_templates() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router(deployment.clone());
    let listener = TokioTcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let base_url = format!("http://127.0.0.1:{}", port);

    // Start server in background
    let server_handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Create test templates
    create_test_template(&deployment.db().pool, "bug_report", None).await;
    create_test_template(&deployment.db().pool, "test_plan", None).await;

    // Give server time to start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Create MCP server client
    let mcp_server = TaskServer::new(&base_url);

    // Call list templates
    let params = serde_json::json!({});

    let result = mcp_server
        .list_task_templates(
            rmcp::handler::server::tool::Parameters(
                serde_json::from_value(params).unwrap(),
            ),
        )
        .await;

    // Stop server
    server_handle.abort();

    assert!(result.is_ok());
    let call_result: CallToolResult = result.unwrap();
    if call_result.is_error.unwrap_or(false) {
        panic!("Expected success but got error");
    }
    let content = call_result.content.unwrap();
    assert!(!content.is_empty());
    let response_text = content[0].as_text().unwrap().text.as_str();
    let response: serde_json::Value = serde_json::from_str(response_text).unwrap();
    assert!(response.get("templates").is_some());
    let templates = response["templates"].as_array().unwrap();
    assert!(templates.len() >= 2);
}

#[tokio::test]
async fn test_mcp_get_template() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router(deployment.clone());
    let listener = TokioTcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let base_url = format!("http://127.0.0.1:{}", port);

    // Start server in background
    let server_handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Create test template
    let template = create_test_template(&deployment.db().pool, "bug_report", None).await;

    // Give server time to start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Create MCP server client
    let mcp_server = TaskServer::new(&base_url);

    // Call get template
    let params = serde_json::json!({
        "template_id": template.id
    });

    let result = mcp_server
        .get_task_template(
            rmcp::handler::server::tool::Parameters(
                serde_json::from_value(params).unwrap(),
            ),
        )
        .await;

    // Stop server
    server_handle.abort();

    assert!(result.is_ok());
    let call_result: CallToolResult = result.unwrap();
    if call_result.is_error.unwrap_or(false) {
        panic!("Expected success but got error");
    }
    let content = call_result.content.unwrap();
    assert!(!content.is_empty());
    let response_text = content[0].as_text().unwrap().text.as_str();
    let response: serde_json::Value = serde_json::from_str(response_text).unwrap();
    assert_eq!(response["template_name"].as_str().unwrap(), "bug_report");
    assert_eq!(Uuid::parse_str(response["id"].as_str().unwrap()).unwrap(), template.id);
}

#[tokio::test]
async fn test_mcp_create_template() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router(deployment.clone());
    let listener = TokioTcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let base_url = format!("http://127.0.0.1:{}", port);

    // Start server in background
    let server_handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Give server time to start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Create MCP server client
    let mcp_server = TaskServer::new(&base_url);

    // Call create template
    let params = serde_json::json!({
        "group_id": null,
        "template_name": "new_template",
        "template_title": "New Template",
        "ticket_title": "New Ticket Title",
        "ticket_description": "New Ticket Description"
    });

    let result = mcp_server
        .create_task_template(
            rmcp::handler::server::tool::Parameters(
                serde_json::from_value(params).unwrap(),
            ),
        )
        .await;

    // Stop server
    server_handle.abort();

    assert!(result.is_ok());
    let call_result: CallToolResult = result.unwrap();
    if call_result.is_error.unwrap_or(false) {
        panic!("Expected success but got error");
    }
    let content = call_result.content.unwrap();
    assert!(!content.is_empty());
    let response_text = content[0].as_text().unwrap().text.as_str();
    let response: serde_json::Value = serde_json::from_str(response_text).unwrap();
    assert_eq!(response["template_name"].as_str().unwrap(), "new_template");
}

#[tokio::test]
async fn test_mcp_list_template_groups() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router(deployment.clone());
    let listener = TokioTcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let base_url = format!("http://127.0.0.1:{}", port);

    // Start server in background
    let server_handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Create test groups
    create_test_template_group(&deployment.db().pool, "Group 1", None).await;
    create_test_template_group(&deployment.db().pool, "Group 2", None).await;

    // Give server time to start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Create MCP server client
    let mcp_server = TaskServer::new(&base_url);

    // Call list groups
    let params = serde_json::json!({
        "hierarchical": true
    });

    let result = mcp_server
        .list_task_template_groups(
            rmcp::handler::server::tool::Parameters(
                serde_json::from_value(params).unwrap(),
            ),
        )
        .await;

    // Stop server
    server_handle.abort();

    assert!(result.is_ok());
    let call_result: CallToolResult = result.unwrap();
    if call_result.is_error.unwrap_or(false) {
        panic!("Expected success but got error");
    }
    let content = call_result.content.unwrap();
    assert!(!content.is_empty());
    let response_text = content[0].as_text().unwrap().text.as_str();
    let response: serde_json::Value = serde_json::from_str(response_text).unwrap();
    assert!(response.get("groups").is_some());
    let groups = response["groups"].as_array().unwrap();
    assert!(groups.len() >= 2);
}
