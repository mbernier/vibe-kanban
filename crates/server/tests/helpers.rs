use axum::Router;
use db::models::{
    project::{CreateProject, Project},
    task::{CreateTask, Task},
    task_relationship::{
        CreateTaskRelationship, TaskRelationship, TaskRelationshipGrouped,
    },
    task_relationship_type::{
        CreateTaskRelationshipType, TaskRelationshipType,
    },
    task_template::{CreateTaskTemplate, TaskTemplate},
    task_template_group::{CreateTaskTemplateGroup, TaskTemplateGroup},
};
use deployment::Deployment;
use sqlx::{SqlitePool, Pool, Sqlite};
use std::str::FromStr;
use tempfile::TempDir;
use uuid::Uuid;

use server::{routes, DeploymentImpl};

/// Create a test deployment with an isolated database
/// This ensures each test gets a fresh database instance
pub async fn create_test_deployment() -> (DeploymentImpl, TempDir) {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    
    // Use the test-specific deployment constructor
    let deployment = local_deployment::LocalDeployment::new_for_testing(&db_path)
        .await
        .unwrap();
    
    (deployment, temp_dir)
}

pub async fn create_test_db() -> (SqlitePool, TempDir) {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.db");
    let database_url = format!("sqlite://{}", db_path.to_string_lossy());

    let options = sqlx::sqlite::SqliteConnectOptions::from_str(&database_url)
        .unwrap()
        .create_if_missing(true);

    let pool = sqlx::SqlitePool::connect_with(options).await.unwrap();
    sqlx::migrate!("../db/migrations").run(&pool).await.unwrap();

    (pool, temp_dir)
}

pub async fn create_test_project(pool: &SqlitePool) -> Project {
    let temp_dir = TempDir::new().unwrap();
    let git_repo_path = temp_dir.path().join("test-repo");
    std::fs::create_dir_all(&git_repo_path).unwrap();

    Project::create(
        pool,
        &CreateProject {
            name: "Test Project".to_string(),
            git_repo_path: git_repo_path.to_string_lossy().to_string(),
            use_existing_repo: false,
            setup_script: None,
            dev_script: None,
            cleanup_script: None,
            copy_files: None,
        },
        Uuid::new_v4(),
    )
    .await
    .unwrap()
}

pub async fn create_test_task(pool: &SqlitePool, project_id: Uuid) -> Task {
    Task::create(
        pool,
        &CreateTask {
            project_id,
            title: "Test Task".to_string(),
            description: Some("Test Description".to_string()),
            parent_task_attempt: None,
            image_ids: None,
        },
        Uuid::new_v4(),
    )
    .await
    .unwrap()
}

pub async fn create_test_relationship_type(
    pool: &SqlitePool,
    type_name: &str,
    is_directional: bool,
    enforces_blocking: bool,
) -> TaskRelationshipType {
    TaskRelationshipType::create(
        pool,
        &CreateTaskRelationshipType {
            type_name: type_name.to_string(),
            display_name: format!("Display {}", type_name),
            description: Some(format!("Description for {}", type_name)),
            is_directional,
            forward_label: if is_directional {
                Some(format!("{} forward", type_name))
            } else {
                None
            },
            reverse_label: if is_directional {
                Some(format!("{} reverse", type_name))
            } else {
                None
            },
            enforces_blocking,
            blocking_disabled_statuses: if enforces_blocking {
                Some(vec!["todo".to_string(), "inreview".to_string()])
            } else {
                None
            },
            blocking_source_statuses: if enforces_blocking {
                Some(vec!["todo".to_string(), "inprogress".to_string()])
            } else {
                None
            },
        },
    )
    .await
    .unwrap()
}

pub async fn create_test_template_group(
    pool: &SqlitePool,
    name: &str,
    parent_id: Option<Uuid>,
) -> TaskTemplateGroup {
    TaskTemplateGroup::create(
        pool,
        &CreateTaskTemplateGroup {
            name: name.to_string(),
            parent_group_id: parent_id,
        },
    )
    .await
    .unwrap()
}

pub async fn create_test_template(
    pool: &SqlitePool,
    template_name: &str,
    group_id: Option<Uuid>,
) -> TaskTemplate {
    TaskTemplate::create(
        pool,
        &CreateTaskTemplate {
            group_id,
            template_name: template_name.to_string(),
            template_title: format!("{} Template", template_name),
            ticket_title: format!("Ticket: {}", template_name),
            ticket_description: format!("Description for {}", template_name),
        },
    )
    .await
    .unwrap()
}

pub async fn create_test_deployment_with_pool(pool: Pool<Sqlite>) -> DeploymentImpl {
    // Note: This is a simplified approach. In a real scenario, you might need
    // to create a full LocalDeployment with all its dependencies.
    // For now, we'll use the pool directly for model-level tests.
    // For API tests, we'll need to set up a proper deployment.
    
    // This is a placeholder - actual implementation would require more setup
    // For now, we'll test at the model level and use a test server for API tests
    DeploymentImpl::new().await.unwrap()
}

pub fn create_app(deployment: DeploymentImpl) -> axum::Router {
    // routes::router returns IntoMakeService<Router>, but for testing we need Router
    // We'll create the router directly without the IntoMakeService wrapper
    // Actually, let's just use the router directly - IntoMakeService should work with oneshot
    use axum::Router;
    use axum::routing::get;
    use axum::middleware::from_fn_with_state;
    use server::routes;
    
    // Extract the router structure from routes::router
    // Since router() returns IntoMakeService, we need to build the router ourselves
    // For now, let's create a test router that matches the structure
    let base_routes = Router::new()
        .merge(routes::task_relationship_types::router(&deployment))
        .merge(routes::task_relationships::router(&deployment))
        .merge(routes::task_templates::router(&deployment))
        .merge(routes::task_template_groups::router(&deployment))
        .with_state(deployment.clone());
    
    Router::new()
        .nest("/api", base_routes)
        .layer(from_fn_with_state(
            deployment.clone(),
            routes::auth::sentry_user_context_middleware,
        ))
        .with_state(deployment)
}
