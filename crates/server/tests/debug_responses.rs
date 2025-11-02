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

#[tokio::test]
async fn debug_api_responses() {
    println!("\n=== DEBUGGING API RESPONSES ===\n");
    
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
    let group = create_test_template_group(&deployment.db().pool, "Test Group", None).await;
    let template = create_test_template(&deployment.db().pool, "test_template", Some(group.id)).await;

    // Give server time to start
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

    println!("Created test data:");
    println!("  Group ID: {}", group.id);
    println!("  Template ID: {}", template.id);
    println!();

    // Test 1: GET /api/task-template-groups/{id}
    println!("=== API: GET /api/task-template-groups/{} ===", group.id);
    let client = reqwest::Client::new();
    let response = client
        .get(&format!("{}/api/task-template-groups/{}", base_url, group.id))
        .send()
        .await
        .unwrap();
    let status = response.status();
    let body = response.text().await.unwrap();
    println!("Status: {:?}", status);
    println!("Body: {}", serde_json::to_string_pretty(&serde_json::from_str::<serde_json::Value>(&body).unwrap()).unwrap());
    println!();

    // Test 2: GET /api/task-templates/{id}
    println!("=== API: GET /api/task-templates/{} ===", template.id);
    let response = client
        .get(&format!("{}/api/task-templates/{}", base_url, template.id))
        .send()
        .await
        .unwrap();
    let status = response.status();
    let body = response.text().await.unwrap();
    println!("Status: {:?}", status);
    println!("Body: {}", serde_json::to_string_pretty(&serde_json::from_str::<serde_json::Value>(&body).unwrap()).unwrap());
    println!();

    // Test 3: POST /api/task-templates (create)
    println!("=== API: POST /api/task-templates ===");
    let create_payload = json!({
        "group_id": null,
        "template_name": "new_api_template",
        "template_title": "New API Template",
        "ticket_title": "New Ticket Title",
        "ticket_description": "New Ticket Description"
    });
    let response = client
        .post(&format!("{}/api/task-templates", base_url))
        .json(&create_payload)
        .send()
        .await
        .unwrap();
    let status = response.status();
    let body = response.text().await.unwrap();
    println!("Status: {:?}", status);
    println!("Body: {}", serde_json::to_string_pretty(&serde_json::from_str::<serde_json::Value>(&body).unwrap()).unwrap());
    println!();

    server_handle.abort();
}

#[tokio::test]
async fn debug_mcp_responses() {
    println!("\n=== DEBUGGING MCP RESPONSES ===\n");
    
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
    let group = create_test_template_group(&deployment.db().pool, "Test Group", None).await;
    let template = create_test_template(&deployment.db().pool, "test_template", Some(group.id)).await;

    // Give server time to start
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

    println!("Created test data:");
    println!("  Group ID: {}", group.id);
    println!("  Template ID: {}", template.id);
    println!();

    let mcp_server = TaskServer::new(&base_url);

    // Test 1: MCP list_task_template_groups
    println!("=== MCP: list_task_template_groups ===");
    let params = json!({
        "hierarchical": true
    });
    let result = mcp_server
        .list_task_template_groups(
            rmcp::handler::server::tool::Parameters(
                serde_json::from_value(params).unwrap(),
            ),
        )
        .await;
    
    match result {
        Ok(call_result) => {
            println!("CallResult: {:?}", call_result);
            println!("is_error: {:?}", call_result.is_error);
            if let Some(content) = call_result.content {
                println!("Content length: {}", content.len());
                for (i, c) in content.iter().enumerate() {
                    println!("Content[{}]: {:?}", i, c);
                    // Try to extract text
                    if let Some(text) = c.as_text() {
                        println!("  as_text(): {:?}", text);
                        println!("  text.text: {}", text.text);
                    }
                }
            }
        }
        Err(e) => {
            println!("Error: {:?}", e);
        }
    }
    println!();

    // Test 2: MCP get_task_template
    println!("=== MCP: get_task_template ===");
    let params = json!({
        "template_id": template.id
    });
    let result = mcp_server
        .get_task_template(
            rmcp::handler::server::tool::Parameters(
                serde_json::from_value(params).unwrap(),
            ),
        )
        .await;
    
    match result {
        Ok(call_result) => {
            println!("CallResult: {:?}", call_result);
            println!("is_error: {:?}", call_result.is_error);
            if let Some(content) = call_result.content {
                println!("Content length: {}", content.len());
                for (i, c) in content.iter().enumerate() {
                    println!("Content[{}]: {:?}", i, c);
                    // Try to extract text
                    if let Some(text) = c.as_text() {
                        println!("  as_text(): {:?}", text);
                        println!("  text.text: {}", text.text);
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text.text) {
                            println!("  Parsed JSON: {}", serde_json::to_string_pretty(&json).unwrap());
                        }
                    }
                }
            }
        }
        Err(e) => {
            println!("Error: {:?}", e);
        }
    }
    println!();

    // Test 3: MCP create_task_template
    println!("=== MCP: create_task_template ===");
    let params = json!({
        "group_id": null,
        "template_name": "new_mcp_template",
        "template_title": "New MCP Template",
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
    
    match result {
        Ok(call_result) => {
            println!("CallResult.is_error: {:?}", call_result.is_error);
            if let Some(content) = call_result.content {
                println!("Content length: {}", content.len());
                for (i, c) in content.iter().enumerate() {
                    println!("\nContent[{}]:", i);
                    println!("  Type: {:?}", std::any::type_name_of_val(c));
                    println!("  Debug: {:?}", c);
                    // Try to extract text using as_text()
                    if let Some(text) = c.as_text() {
                        println!("  as_text() SUCCESS:");
                        println!("    text: {}", text.text);
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text.text) {
                            println!("    Parsed JSON: {}", serde_json::to_string_pretty(&json).unwrap());
                        }
                    } else {
                        println!("  as_text() returned None");
                    }
                }
            } else {
                println!("Content is None");
            }
        }
        Err(e) => {
            println!("Error: {:?}", e);
        }
    }
    println!();

    server_handle.abort();
}
