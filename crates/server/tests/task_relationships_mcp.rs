mod helpers;

use db::models::{
    task_relationship::{TaskRelationship, CreateTaskRelationship},
    task_relationship_type::TaskRelationshipType,
};
use deployment::Deployment;
use rmcp::model::{CallToolResult, Content};
use serde_json::json;
use tokio::net::TcpListener as TokioTcpListener;
use uuid::Uuid;

use crate::helpers::*;
use server::{routes, mcp::task_server::TaskServer};


#[tokio::test]
async fn test_mcp_list_relationships() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router(deployment.clone());
    let listener = TokioTcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let base_url = format!("http://127.0.0.1:{}", port);

    // Start server in background
    let server_handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Create test data
    let project = create_test_project(&deployment.db().pool).await;
    let task1 = create_test_task(&deployment.db().pool, project.id).await;
    let task2 = create_test_task(&deployment.db().pool, project.id).await;
    let rel_type = create_test_relationship_type(&deployment.db().pool, "test_type", true, false).await;

    // Create relationship
    let relationship = TaskRelationship::create(
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

    // Verify relationship exists
    let relationships_before = TaskRelationship::find_by_task(&deployment.db().pool, task1.id).await.unwrap();
    assert!(!relationships_before.is_empty(), "Relationship should exist before API call");
    eprintln!("Found {} relationships before API call", relationships_before.len());

    // Give server time to start
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    
    // Test the API endpoint directly first
    let client = reqwest::Client::new();
    let api_url = format!("{}/api/tasks/{}/relationships", base_url, task1.id);
    eprintln!("Testing API URL: {}", api_url);
    let api_response = client.get(&api_url).send().await.unwrap();
    eprintln!("API response status: {}", api_response.status());
    let api_body = api_response.text().await.unwrap();
    eprintln!("API response body: {}", api_body);

    // Create MCP server client
    let mcp_server = TaskServer::new(&base_url);

    // Call list action
    let params = serde_json::json!({
        "task_id": task1.id,
        "action": "list",
        "include_notes": true
    });

    let result = mcp_server
        .manage_task_relationships(
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
        let error_text = call_result.content
            .and_then(|c| c.first().cloned())
            .and_then(|content| content.as_text().map(|text| text.text.clone()))
            .unwrap_or_else(|| "Unknown error".to_string());
        panic!("Expected success but got error: {}", error_text);
    }
    let content = call_result.content.unwrap();
    assert!(!content.is_empty());
    let response_text = content[0].as_text().unwrap().text.as_str();
    let response: serde_json::Value = serde_json::from_str(response_text).unwrap();
    assert!(response.get("relationships").is_some());
    let relationships = response["relationships"].as_array().unwrap();
    
    // Debug: Print the response if empty
    if relationships.is_empty() {
        eprintln!("MCP Response: {}", serde_json::to_string_pretty(&response).unwrap());
        panic!("Expected relationships but got empty array");
    }
    
    assert!(!relationships.is_empty());
}

#[tokio::test]
async fn test_mcp_add_relationship() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router(deployment.clone());
    let listener = TokioTcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let base_url = format!("http://127.0.0.1:{}", port);

    // Start server in background
    let server_handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Create test data
    let project = create_test_project(&deployment.db().pool).await;
    let task1 = create_test_task(&deployment.db().pool, project.id).await;
    let task2 = create_test_task(&deployment.db().pool, project.id).await;
    let _rel_type = create_test_relationship_type(&deployment.db().pool, "test_type", true, false).await;

    // Give server time to start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Create MCP server client
    let mcp_server = TaskServer::new(&base_url);

    // Call add action
    let params = serde_json::json!({
        "task_id": task1.id,
        "action": "add",
        "target_task_id": task2.id,
        "relationship_type": "test_type",
        "note": "Created via MCP"
    });

    let result = mcp_server
        .manage_task_relationships(
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
        let error_text = call_result.content
            .and_then(|c| c.first().cloned())
            .and_then(|content| content.as_text().map(|text| text.text.clone()))
            .unwrap_or_else(|| "Unknown error".to_string());
        panic!("Expected success but got error: {}", error_text);
    }
    let content = call_result.content.unwrap();
    assert!(!content.is_empty());
    let response_text = content[0].as_text().unwrap().text.as_str();
    let response: serde_json::Value = serde_json::from_str(response_text).unwrap();
    assert!(response.get("relationships").is_some());
    let relationships = response["relationships"].as_array().unwrap();
    assert_eq!(relationships.len(), 1);
}

#[tokio::test]
async fn test_mcp_update_relationship() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router(deployment.clone());
    let listener = TokioTcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let base_url = format!("http://127.0.0.1:{}", port);

    // Start server in background
    let server_handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Create test data
    let project = create_test_project(&deployment.db().pool).await;
    let task1 = create_test_task(&deployment.db().pool, project.id).await;
    let task2 = create_test_task(&deployment.db().pool, project.id).await;
    let rel_type = create_test_relationship_type(&deployment.db().pool, "test_type", true, false).await;

    // Create relationship
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

    // Give server time to start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Create MCP server client
    let mcp_server = TaskServer::new(&base_url);

    // Call update action
    let params = serde_json::json!({
        "task_id": task1.id,
        "action": "update",
        "relationship_id": relationship.id,
        "note": "Updated via MCP"
    });

    let result = mcp_server
        .manage_task_relationships(
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
        let error_text = call_result.content
            .and_then(|c| c.first().cloned())
            .and_then(|content| content.as_text().map(|text| text.text.clone()))
            .unwrap_or_else(|| "Unknown error".to_string());
        panic!("Expected success but got error: {}", error_text);
    }
    let content = call_result.content.unwrap();
    assert!(!content.is_empty());
    let response_text = content[0].as_text().unwrap().text.as_str();
    let response: serde_json::Value = serde_json::from_str(response_text).unwrap();
    assert!(response.get("relationships").is_some());
    let relationships = response["relationships"].as_array().unwrap();
    assert_eq!(relationships.len(), 1);
}

#[tokio::test]
async fn test_mcp_delete_relationship() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router(deployment.clone());
    let listener = TokioTcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let base_url = format!("http://127.0.0.1:{}", port);

    // Start server in background
    let server_handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Create test data
    let project = create_test_project(&deployment.db().pool).await;
    let task1 = create_test_task(&deployment.db().pool, project.id).await;
    let task2 = create_test_task(&deployment.db().pool, project.id).await;
    let rel_type = create_test_relationship_type(&deployment.db().pool, "test_type", true, false).await;

    // Create relationship
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

    // Give server time to start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Create MCP server client
    let mcp_server = TaskServer::new(&base_url);

    // Call delete action
    let params = serde_json::json!({
        "task_id": task1.id,
        "action": "delete",
        "relationship_id": relationship.id
    });

    let result = mcp_server
        .manage_task_relationships(
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
        let error_text = call_result.content
            .and_then(|c| c.first().cloned())
            .and_then(|content| content.as_text().map(|text| text.text.clone()))
            .unwrap_or_else(|| "Unknown error".to_string());
        panic!("Expected success but got error: {}", error_text);
    }
    let content = call_result.content.unwrap();
    assert!(!content.is_empty());
    let response_text = content[0].as_text().unwrap().text.as_str();
    let response: serde_json::Value = serde_json::from_str(response_text).unwrap();
    assert!(response.get("relationships").is_some());
    let relationships = response["relationships"].as_array().unwrap();
    assert_eq!(relationships.len(), 0);
}

#[tokio::test]
async fn test_mcp_invalid_action() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router(deployment.clone());
    let listener = TokioTcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let base_url = format!("http://127.0.0.1:{}", port);

    // Start server in background
    let server_handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Create test data
    let project = create_test_project(&deployment.db().pool).await;
    let task1 = create_test_task(&deployment.db().pool, project.id).await;

    // Give server time to start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Create MCP server client
    let mcp_server = TaskServer::new(&base_url);

    // Call with invalid action
    let params = serde_json::json!({
        "task_id": task1.id,
        "action": "invalid_action"
    });

    let result = mcp_server
        .manage_task_relationships(
            rmcp::handler::server::tool::Parameters(
                serde_json::from_value(params).unwrap(),
            ),
        )
        .await;

    // Stop server
    server_handle.abort();

    assert!(result.is_ok());
    let call_result: CallToolResult = result.unwrap();
    if !call_result.is_error.unwrap_or(false) {
        panic!("Expected error but got success");
    }
    // Expected - invalid action should return error
}

#[tokio::test]
async fn test_mcp_missing_required_params() {
    let (deployment, _temp_dir) = create_test_deployment().await;
    let app = routes::router(deployment.clone());
    let listener = TokioTcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let base_url = format!("http://127.0.0.1:{}", port);

    // Start server in background
    let server_handle = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Create test data
    let project = create_test_project(&deployment.db().pool).await;
    let task1 = create_test_task(&deployment.db().pool, project.id).await;

    // Give server time to start
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Create MCP server client
    let mcp_server = TaskServer::new(&base_url);

    // Call add action without required target_task_id
    let params = serde_json::json!({
        "task_id": task1.id,
        "action": "add",
        "relationship_type": "test_type"
        // Missing target_task_id
    });

    let result = mcp_server
        .manage_task_relationships(
            rmcp::handler::server::tool::Parameters(
                serde_json::from_value(params).unwrap(),
            ),
        )
        .await;

    // Stop server
    server_handle.abort();

    assert!(result.is_ok());
    let call_result: CallToolResult = result.unwrap();
    if !call_result.is_error.unwrap_or(false) {
        panic!("Expected error but got success");
    }
    // Expected - missing required parameter should return error
}

