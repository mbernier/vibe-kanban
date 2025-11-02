use std::{future::Future, path::PathBuf, str::FromStr};

use db::models::{
    project::Project,
    task::{CreateTask, Task, TaskStatus, TaskWithAttemptStatus, UpdateTask},
    task_attempt::TaskAttempt,
    task_relationship::{TaskRelationship, TaskRelationshipGrouped},
    task_template::{CreateTaskTemplate, TaskTemplate, UpdateTaskTemplate},
    task_template_group::{CreateTaskTemplateGroup, TaskTemplateGroup, TaskTemplateGroupWithChildren, UpdateTaskTemplateGroup},
};
use executors::{executors::BaseCodingAgent, profile::ExecutorProfileId};
use rmcp::{
    ErrorData, ServerHandler,
    handler::server::tool::{Parameters, ToolRouter},
    model::{
        CallToolResult, Content, Implementation, ProtocolVersion, ServerCapabilities, ServerInfo,
    },
    schemars, tool, tool_handler, tool_router,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json;
use uuid::Uuid;

use crate::routes::task_attempts::CreateTaskAttemptBody;

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateTaskRequest {
    #[schemars(description = "The ID of the project to create the task in. This is required!")]
    pub project_id: Uuid,
    #[schemars(description = "The title of the task")]
    pub title: String,
    #[schemars(description = "Optional description of the task")]
    pub description: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct CreateTaskResponse {
    pub task_id: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ProjectSummary {
    #[schemars(description = "The unique identifier of the project")]
    pub id: String,
    #[schemars(description = "The name of the project")]
    pub name: String,
    #[schemars(description = "The path to the git repository")]
    pub git_repo_path: PathBuf,
    #[schemars(description = "Optional setup script for the project")]
    pub setup_script: Option<String>,
    #[schemars(description = "Optional cleanup script for the project")]
    pub cleanup_script: Option<String>,
    #[schemars(description = "Optional development script for the project")]
    pub dev_script: Option<String>,
    #[schemars(description = "When the project was created")]
    pub created_at: String,
    #[schemars(description = "When the project was last updated")]
    pub updated_at: String,
}

impl ProjectSummary {
    fn from_project(project: Project) -> Self {
        Self {
            id: project.id.to_string(),
            name: project.name,
            git_repo_path: project.git_repo_path,
            setup_script: project.setup_script,
            cleanup_script: project.cleanup_script,
            dev_script: project.dev_script,
            created_at: project.created_at.to_rfc3339(),
            updated_at: project.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ListProjectsResponse {
    pub projects: Vec<ProjectSummary>,
    pub count: usize,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListTasksRequest {
    #[schemars(description = "The ID of the project to list tasks from")]
    pub project_id: Uuid,
    #[schemars(
        description = "Optional status filter: 'todo', 'inprogress', 'inreview', 'done', 'cancelled'"
    )]
    pub status: Option<String>,
    #[schemars(description = "Maximum number of tasks to return (default: 50)")]
    pub limit: Option<i32>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct TaskSummary {
    #[schemars(description = "The unique identifier of the task")]
    pub id: String,
    #[schemars(description = "The title of the task")]
    pub title: String,
    #[schemars(description = "Current status of the task")]
    pub status: String,
    #[schemars(description = "When the task was created")]
    pub created_at: String,
    #[schemars(description = "When the task was last updated")]
    pub updated_at: String,
    #[schemars(description = "Whether the task has an in-progress execution attempt")]
    pub has_in_progress_attempt: Option<bool>,
    #[schemars(description = "Whether the task has a merged execution attempt")]
    pub has_merged_attempt: Option<bool>,
    #[schemars(description = "Whether the last execution attempt failed")]
    pub last_attempt_failed: Option<bool>,
}

impl TaskSummary {
    fn from_task_with_status(task: TaskWithAttemptStatus) -> Self {
        Self {
            id: task.id.to_string(),
            title: task.title.to_string(),
            status: task.status.to_string(),
            created_at: task.created_at.to_rfc3339(),
            updated_at: task.updated_at.to_rfc3339(),
            has_in_progress_attempt: Some(task.has_in_progress_attempt),
            has_merged_attempt: Some(task.has_merged_attempt),
            last_attempt_failed: Some(task.last_attempt_failed),
        }
    }
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct TaskDetails {
    #[schemars(description = "The unique identifier of the task")]
    pub id: String,
    #[schemars(description = "The title of the task")]
    pub title: String,
    #[schemars(description = "Optional description of the task")]
    pub description: Option<String>,
    #[schemars(description = "Current status of the task")]
    pub status: String,
    #[schemars(description = "When the task was created")]
    pub created_at: String,
    #[schemars(description = "When the task was last updated")]
    pub updated_at: String,
    #[schemars(description = "Whether the task has an in-progress execution attempt")]
    pub has_in_progress_attempt: Option<bool>,
    #[schemars(description = "Whether the task has a merged execution attempt")]
    pub has_merged_attempt: Option<bool>,
    #[schemars(description = "Whether the last execution attempt failed")]
    pub last_attempt_failed: Option<bool>,
}

impl TaskDetails {
    fn from_task(task: Task) -> Self {
        Self {
            id: task.id.to_string(),
            title: task.title,
            description: task.description,
            status: task.status.to_string(),
            created_at: task.created_at.to_rfc3339(),
            updated_at: task.updated_at.to_rfc3339(),
            has_in_progress_attempt: None,
            has_merged_attempt: None,
            last_attempt_failed: None,
        }
    }
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ListTasksResponse {
    pub tasks: Vec<TaskSummary>,
    pub count: usize,
    pub project_id: String,
    pub applied_filters: ListTasksFilters,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ListTasksFilters {
    pub status: Option<String>,
    pub limit: i32,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateTaskRequest {
    #[schemars(description = "The ID of the task to update")]
    pub task_id: Uuid,
    #[schemars(description = "New title for the task")]
    pub title: Option<String>,
    #[schemars(description = "New description for the task")]
    pub description: Option<String>,
    #[schemars(description = "New status: 'todo', 'inprogress', 'inreview', 'done', 'cancelled'")]
    pub status: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct UpdateTaskResponse {
    pub task: TaskDetails,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct DeleteTaskRequest {
    #[schemars(description = "The ID of the task to delete")]
    pub task_id: Uuid,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct StartTaskAttemptRequest {
    #[schemars(description = "The ID of the task to start")]
    pub task_id: Uuid,
    #[schemars(
        description = "The coding agent executor to run ('CLAUDE_CODE', 'CODEX', 'GEMINI', 'CURSOR_AGENT', 'OPENCODE')"
    )]
    pub executor: String,
    #[schemars(description = "Optional executor variant, if needed")]
    pub variant: Option<String>,
    #[schemars(description = "The base branch to use for the attempt")]
    pub base_branch: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct StartTaskAttemptResponse {
    pub task_id: String,
    pub attempt_id: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct DeleteTaskResponse {
    pub deleted_task_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetTaskRequest {
    #[schemars(description = "The ID of the task to retrieve")]
    pub task_id: Uuid,
    #[schemars(description = "If true, include attempts and latest notes summaries")] 
    pub include_attempts: Option<bool>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct AttemptNotesSummary {
    pub attempt_id: String,
    pub created_at: String,
    pub updated_at: String,
    pub executor: String,
    pub branch: String,
    pub target_branch: String,
    pub latest_summary: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ManageTaskRelationshipsRequest {
    #[schemars(description = "The ID of the task to manage relationships for")]
    pub task_id: Uuid,
    #[schemars(description = "Action to perform: 'add', 'update', 'delete', or 'list'")]
    pub action: String,
    #[schemars(description = "Relationship ID (required for 'update' and 'delete' actions)")]
    pub relationship_id: Option<Uuid>,
    #[schemars(description = "Target task ID (required for 'add' action, optional for 'update')")]
    pub target_task_id: Option<Uuid>,
    #[schemars(description = "Relationship type name (required for 'add' action, optional for 'update')")]
    pub relationship_type: Option<String>,
    #[schemars(description = "Optional note about the relationship")]
    pub note: Option<String>,
    #[schemars(description = "Optional JSON data for the relationship")]
    pub data: Option<serde_json::Value>,
    #[schemars(description = "Whether to include notes in the response (default: true)")]
    pub include_notes: Option<bool>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct TaskRelationshipSummary {
    pub relationship_id: String,
    pub relationship_type: String,
    pub relationship_type_display: String,
    pub source_task_id: String,
    pub source_task_title: String,
    pub target_task_id: String,
    pub target_task_title: String,
    #[schemars(description = "Direction ('forward' or 'reverse') for directional relationships")]
    pub direction: Option<String>,
    #[schemars(description = "Optional note about the relationship")]
    pub note: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ManageTaskRelationshipsResponse {
    pub relationships: Vec<TaskRelationshipSummary>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListTaskTemplatesRequest {
    #[schemars(description = "Optional group ID to filter templates by")]
    pub group_id: Option<Uuid>,
    #[schemars(description = "Optional search query to filter templates")]
    pub search: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ListTaskTemplatesResponse {
    pub count: usize,
    pub templates: Vec<TaskTemplate>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetTaskTemplateRequest {
    #[schemars(description = "The ID of the template to retrieve")]
    pub template_id: Option<Uuid>,
    #[schemars(description = "The template name (slug) to retrieve")]
    pub template_name: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct GetTaskTemplateResponse {
    pub template: TaskTemplate,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateTaskTemplateRequest {
    #[schemars(description = "Optional group ID to assign template to")]
    pub group_id: Option<Uuid>,
    #[schemars(description = "Unique template name (slug) for referencing")]
    pub template_name: String,
    #[schemars(description = "Display title of the template")]
    pub template_title: String,
    #[schemars(description = "Title for tickets created from this template")]
    pub ticket_title: String,
    #[schemars(description = "Description for tickets created from this template")]
    pub ticket_description: String,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct CreateTaskTemplateResponse {
    pub template_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateTaskTemplateRequest {
    #[schemars(description = "The ID of the template to update")]
    pub template_id: Uuid,
    #[schemars(description = "Optional group ID to assign template to")]
    pub group_id: Option<Uuid>,
    #[schemars(description = "Optional template name (slug)")]
    pub template_name: Option<String>,
    #[schemars(description = "Optional template title")]
    pub template_title: Option<String>,
    #[schemars(description = "Optional ticket title")]
    pub ticket_title: Option<String>,
    #[schemars(description = "Optional ticket description")]
    pub ticket_description: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct UpdateTaskTemplateResponse {
    pub template: TaskTemplate,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct DeleteTaskTemplateRequest {
    #[schemars(description = "The ID of the template to delete")]
    pub template_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct DeleteTaskTemplateResponse {
    pub deleted_template_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListTaskTemplateGroupsRequest {
    #[schemars(description = "If true, return hierarchical tree structure")]
    pub hierarchical: Option<bool>,
    #[schemars(description = "Optional parent group ID to filter by")]
    pub parent_id: Option<Uuid>,
    #[schemars(description = "Optional search query to filter groups")]
    pub search: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct ListTaskTemplateGroupsResponse {
    pub count: usize,
    pub groups: Vec<TaskTemplateGroupWithChildren>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetTaskTemplateGroupRequest {
    #[schemars(description = "The ID of the group to retrieve")]
    pub group_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct GetTaskTemplateGroupResponse {
    pub group: TaskTemplateGroup,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct CreateTaskTemplateGroupRequest {
    #[schemars(description = "Name of the group")]
    pub name: String,
    #[schemars(description = "Optional parent group ID (max depth 3)")]
    pub parent_group_id: Option<Uuid>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct CreateTaskTemplateGroupResponse {
    pub group_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateTaskTemplateGroupRequest {
    #[schemars(description = "The ID of the group to update")]
    pub group_id: Uuid,
    #[schemars(description = "Optional name")]
    pub name: Option<String>,
    #[schemars(description = "Optional parent group ID (max depth 3)")]
    pub parent_group_id: Option<Uuid>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct UpdateTaskTemplateGroupResponse {
    pub group: TaskTemplateGroup,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct DeleteTaskTemplateGroupRequest {
    #[schemars(description = "The ID of the group to delete")]
    pub group_id: Uuid,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct DeleteTaskTemplateGroupResponse {
    pub deleted_group_id: Option<String>,
}

#[derive(Debug, Serialize, schemars::JsonSchema)]
pub struct GetTaskResponse {
    pub task: TaskDetails,
    #[schemars(description = "Optional list of attempts with latest note summaries")]
    pub attempts: Option<Vec<AttemptNotesSummary>>,
}

#[derive(Debug, Clone)]
pub struct TaskServer {
    client: reqwest::Client,
    base_url: String,
    tool_router: ToolRouter<TaskServer>,
}

impl TaskServer {
    pub fn new(base_url: &str) -> Self {
        Self {
            client: reqwest::Client::new(),
            base_url: base_url.to_string(),
            tool_router: Self::tool_router(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct ApiResponseEnvelope<T> {
    success: bool,
    data: Option<T>,
    message: Option<String>,
}

impl TaskServer {
    fn success<T: Serialize>(data: &T) -> Result<CallToolResult, ErrorData> {
        Ok(CallToolResult::success(vec![Content::text(
            serde_json::to_string_pretty(data)
                .unwrap_or_else(|_| "Failed to serialize response".to_string()),
        )]))
    }

    fn err_value(v: serde_json::Value) -> Result<CallToolResult, ErrorData> {
        Ok(CallToolResult::error(vec![Content::text(
            serde_json::to_string_pretty(&v)
                .unwrap_or_else(|_| "Failed to serialize error".to_string()),
        )]))
    }

    fn err<S: Into<String>>(msg: S, details: Option<S>) -> Result<CallToolResult, ErrorData> {
        let mut v = serde_json::json!({"success": false, "error": msg.into()});
        if let Some(d) = details {
            v["details"] = serde_json::json!(d.into());
        };
        Self::err_value(v)
    }

    async fn send_json<T: DeserializeOwned>(
        &self,
        rb: reqwest::RequestBuilder,
    ) -> Result<T, CallToolResult> {
        let resp = rb
            .send()
            .await
            .map_err(|e| Self::err("Failed to connect to VK API", Some(&e.to_string())).unwrap())?;

        if !resp.status().is_success() {
            let status = resp.status();
            return Err(
                Self::err(format!("VK API returned error status: {}", status), None).unwrap(),
            );
        }

        let api_response = resp.json::<ApiResponseEnvelope<T>>().await.map_err(|e| {
            Self::err("Failed to parse VK API response", Some(&e.to_string())).unwrap()
        })?;

        if !api_response.success {
            let msg = api_response.message.as_deref().unwrap_or("Unknown error");
            return Err(Self::err("VK API returned error", Some(msg)).unwrap());
        }

        api_response
            .data
            .ok_or_else(|| Self::err("VK API response missing data field", None).unwrap())
    }

    fn url(&self, path: &str) -> String {
        format!(
            "{}/{}",
            self.base_url.trim_end_matches('/'),
            path.trim_start_matches('/')
        )
    }
}

#[tool_router]
impl TaskServer {
    #[tool(
        description = "Create a new task/ticket in a project. Always pass the `project_id` of the project you want to create the task in - it is required!"
    )]
    async fn create_task(
        &self,
        Parameters(CreateTaskRequest {
            project_id,
            title,
            description,
        }): Parameters<CreateTaskRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url("/api/tasks");
        let task: Task = match self
            .send_json(
                self.client
                    .post(&url)
                    .json(&CreateTask::from_title_description(
                        project_id,
                        title,
                        description,
                    )),
            )
            .await
        {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        TaskServer::success(&CreateTaskResponse {
            task_id: task.id.to_string(),
        })
    }

    #[tool(description = "List all the available projects")]
    async fn list_projects(&self) -> Result<CallToolResult, ErrorData> {
        let url = self.url("/api/projects");
        let projects: Vec<Project> = match self.send_json(self.client.get(&url)).await {
            Ok(ps) => ps,
            Err(e) => return Ok(e),
        };

        let project_summaries: Vec<ProjectSummary> = projects
            .into_iter()
            .map(ProjectSummary::from_project)
            .collect();

        let response = ListProjectsResponse {
            count: project_summaries.len(),
            projects: project_summaries,
        };

        TaskServer::success(&response)
    }

    #[tool(
        description = "List all the task/tickets in a project with optional filtering and execution status. `project_id` is required!"
    )]
    async fn list_tasks(
        &self,
        Parameters(ListTasksRequest {
            project_id,
            status,
            limit,
        }): Parameters<ListTasksRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let status_filter = if let Some(ref status_str) = status {
            match TaskStatus::from_str(status_str) {
                Ok(s) => Some(s),
                Err(_) => {
                    return Self::err(
                        "Invalid status filter. Valid values: 'todo', 'in-progress', 'in-review', 'done', 'cancelled'".to_string(),
                        Some(status_str.to_string()),
                    );
                }
            }
        } else {
            None
        };

        let url = self.url(&format!("/api/tasks?project_id={}", project_id));
        let all_tasks: Vec<TaskWithAttemptStatus> =
            match self.send_json(self.client.get(&url)).await {
                Ok(t) => t,
                Err(e) => return Ok(e),
            };

        let task_limit = limit.unwrap_or(50).max(0) as usize;
        let filtered = all_tasks.into_iter().filter(|t| {
            if let Some(ref want) = status_filter {
                &t.status == want
            } else {
                true
            }
        });
        let limited: Vec<TaskWithAttemptStatus> = filtered.take(task_limit).collect();

        let task_summaries: Vec<TaskSummary> = limited
            .into_iter()
            .map(TaskSummary::from_task_with_status)
            .collect();

        let response = ListTasksResponse {
            count: task_summaries.len(),
            tasks: task_summaries,
            project_id: project_id.to_string(),
            applied_filters: ListTasksFilters {
                status: status.clone(),
                limit: task_limit as i32,
            },
        };

        TaskServer::success(&response)
    }

    #[tool(description = "Start working on a task by creating and launching a new task attempt.")]
    async fn start_task_attempt(
        &self,
        Parameters(StartTaskAttemptRequest {
            task_id,
            executor,
            variant,
            base_branch,
        }): Parameters<StartTaskAttemptRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let base_branch = base_branch.trim().to_string();
        if base_branch.is_empty() {
            return Self::err("Base branch must not be empty.".to_string(), None::<String>);
        }

        let executor_trimmed = executor.trim();
        if executor_trimmed.is_empty() {
            return Self::err("Executor must not be empty.".to_string(), None::<String>);
        }

        let normalized_executor = executor_trimmed.replace('-', "_").to_ascii_uppercase();
        let base_executor = match BaseCodingAgent::from_str(&normalized_executor) {
            Ok(exec) => exec,
            Err(_) => {
                return Self::err(
                    format!("Unknown executor '{executor_trimmed}'."),
                    None::<String>,
                );
            }
        };

        let variant = variant.and_then(|v| {
            let trimmed = v.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });

        let executor_profile_id = ExecutorProfileId {
            executor: base_executor,
            variant,
        };

        let payload = CreateTaskAttemptBody {
            task_id,
            executor_profile_id,
            base_branch,
        };

        let url = self.url("/api/task-attempts");
        let attempt: TaskAttempt = match self.send_json(self.client.post(&url).json(&payload)).await
        {
            Ok(attempt) => attempt,
            Err(e) => return Ok(e),
        };

        let response = StartTaskAttemptResponse {
            task_id: attempt.task_id.to_string(),
            attempt_id: attempt.id.to_string(),
        };

        TaskServer::success(&response)
    }

    #[tool(
        description = "Update an existing task/ticket's title, description, or status. `project_id` and `task_id` are required! `title`, `description`, and `status` are optional."
    )]
    async fn update_task(
        &self,
        Parameters(UpdateTaskRequest {
            task_id,
            title,
            description,
            status,
        }): Parameters<UpdateTaskRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let status = if let Some(ref status_str) = status {
            match TaskStatus::from_str(status_str) {
                Ok(s) => Some(s),
                Err(_) => {
                    return Self::err(
                        "Invalid status filter. Valid values: 'todo', 'in-progress', 'in-review', 'done', 'cancelled'".to_string(),
                        Some(status_str.to_string()),
                    );
                }
            }
        } else {
            None
        };

        let payload = UpdateTask {
            title,
            description,
            status,
            parent_task_attempt: None,
            image_ids: None,
        };
        let url = self.url(&format!("/api/tasks/{}", task_id));
        let updated_task: Task = match self.send_json(self.client.put(&url).json(&payload)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        let details = TaskDetails::from_task(updated_task);
        let repsonse = UpdateTaskResponse { task: details };
        TaskServer::success(&repsonse)
    }

    #[tool(
        description = "Delete a task/ticket from a project. `project_id` and `task_id` are required!"
    )]
    async fn delete_task(
        &self,
        Parameters(DeleteTaskRequest { task_id }): Parameters<DeleteTaskRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/tasks/{}", task_id));
        if let Err(e) = self
            .send_json::<serde_json::Value>(self.client.delete(&url))
            .await
        {
            return Ok(e);
        }

        let repsonse = DeleteTaskResponse {
            deleted_task_id: Some(task_id.to_string()),
        };

        TaskServer::success(&repsonse)
    }

    #[tool(
        description = "Get detailed information (like task description) about a specific task/ticket. You can use `list_tasks` to find the `task_ids` of all tasks in a project. `project_id` and `task_id` are required!"
    )]
    async fn get_task(
        &self,
        Parameters(GetTaskRequest { task_id, include_attempts }): Parameters<GetTaskRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/tasks/{}", task_id));
        let task: Task = match self.send_json(self.client.get(&url)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        let details = TaskDetails::from_task(task.clone());

        // Conditionally include attempts when requested
        let attempts = if include_attempts.unwrap_or(false) {
            let aurl = self.url(&format!("/api/tasks/{}/attempts-with-notes", task.id));
            let items: Vec<serde_json::Value> = match self.send_json(self.client.get(&aurl)).await {
                Ok(v) => v,
                Err(e) => return Ok(e),
            };
            let mapped: Vec<AttemptNotesSummary> = items
                .into_iter()
                .filter_map(|v| {
                    let attempt = v.get("attempt")?;
                    Some(AttemptNotesSummary {
                        attempt_id: attempt.get("id").and_then(|v| v.as_str())?.to_string(),
                        created_at: attempt.get("created_at").and_then(|v| v.as_str())?.to_string(),
                        updated_at: attempt.get("updated_at").and_then(|v| v.as_str())?.to_string(),
                        executor: attempt.get("executor").and_then(|v| v.as_str())?.to_string(),
                        branch: attempt.get("branch").and_then(|v| v.as_str())?.to_string(),
                        target_branch: attempt.get("target_branch").and_then(|v| v.as_str())?.to_string(),
                        latest_summary: v
                            .get("latest_summary")
                            .and_then(|s| s.as_str().map(|s| s.to_string())),
                    })
                })
                .collect();
            Some(mapped)
        } else {
            None
        };

        let response = GetTaskResponse { task: details, attempts };

        TaskServer::success(&response)
    }

    #[tool(description = "Manage task relationships (add, update, delete, or list relationships between tasks).")]
    pub async fn manage_task_relationships(
        &self,
        Parameters(ManageTaskRelationshipsRequest {
            task_id,
            action,
            relationship_id,
            target_task_id,
            relationship_type,
            note,
            data,
            include_notes,
        }): Parameters<ManageTaskRelationshipsRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let include_notes = include_notes.unwrap_or(true);

        match action.as_str() {
            "list" => {
                let url = self.url(&format!("/api/tasks/{}/relationships", task_id));
                let relationships: Vec<TaskRelationshipGrouped> = match self.send_json(self.client.get(&url)).await {
                    Ok(v) => v,
                    Err(e) => return Ok(e),
                };

                let mut summaries = Vec::new();
                for rel_group in relationships {
                    let type_name = rel_group.relationship_type.type_name.clone();
                    let display_name = rel_group.relationship_type.display_name.clone();
                    let is_directional = rel_group.relationship_type.is_directional;

                    // Process forward relationships
                    for rel in &rel_group.forward {
                        summaries.push(TaskRelationshipSummary {
                            relationship_id: rel.relationship.id.to_string(),
                            relationship_type: type_name.clone(),
                            relationship_type_display: display_name.clone(),
                            source_task_id: rel.source_task.id.to_string(),
                            source_task_title: rel.source_task.title.clone(),
                            target_task_id: rel.target_task.id.to_string(),
                            target_task_title: rel.target_task.title.clone(),
                            direction: if is_directional {
                                Some("forward".to_string())
                            } else {
                                None
                            },
                            note: if include_notes {
                                rel.relationship.note.clone()
                            } else {
                                None
                            },
                        });
                    }
                    
                    // Process reverse relationships
                    for rel in &rel_group.reverse {
                        summaries.push(TaskRelationshipSummary {
                            relationship_id: rel.relationship.id.to_string(),
                            relationship_type: type_name.clone(),
                            relationship_type_display: display_name.clone(),
                            source_task_id: rel.source_task.id.to_string(),
                            source_task_title: rel.source_task.title.clone(),
                            target_task_id: rel.target_task.id.to_string(),
                            target_task_title: rel.target_task.title.clone(),
                            direction: if is_directional {
                                Some("reverse".to_string())
                            } else {
                                None
                            },
                            note: if include_notes {
                                rel.relationship.note.clone()
                            } else {
                                None
                            },
                        });
                    }
                }

                TaskServer::success(&ManageTaskRelationshipsResponse {
                    relationships: summaries,
                })
            }
            "add" => {
                let relationship_type = match relationship_type {
                    Some(rt) => rt,
                    None => {
                        return Self::err("relationship_type is required for 'add' action", None::<&str>);
                    }
                };

                // First, get relationship type by name
                let types_url = self.url("/api/task-relationship-types");
                let types: Vec<serde_json::Value> = match self.send_json(self.client.get(&types_url)).await {
                    Ok(v) => v,
                    Err(e) => return Ok(e),
                };

                let rel_type_id = match types
                    .iter()
                    .find_map(|t| {
                        let type_name_str = t.get("type_name").and_then(|v| v.as_str())?;
                        if type_name_str == relationship_type {
                            t.get("id").and_then(|v| v.as_str()).and_then(|id| Uuid::parse_str(id).ok())
                        } else {
                            None
                        }
                    }) {
                    Some(id) => id,
                    None => {
                        return Self::err(
                            format!("Relationship type '{}' not found", relationship_type),
                            None::<String>,
                        );
                    }
                };

                let target_task_id = match target_task_id {
                    Some(id) => id,
                    None => {
                        return Self::err("target_task_id is required for 'add' action", None::<&str>);
                    }
                };

                let payload = serde_json::json!({
                    "target_task_id": target_task_id,
                    "relationship_type_id": rel_type_id,
                    "note": note,
                    "data": data,
                });

                let url = self.url(&format!("/api/tasks/{}/relationships", task_id));
                let relationship: TaskRelationship = match self
                    .send_json(self.client.post(&url).json(&payload))
                    .await
                {
                    Ok(v) => v,
                    Err(e) => return Ok(e),
                };

                TaskServer::success(&ManageTaskRelationshipsResponse {
                    relationships: vec![TaskRelationshipSummary {
                        relationship_id: relationship.id.to_string(),
                        relationship_type: relationship_type.clone(),
                        relationship_type_display: "".to_string(), // Will be populated by frontend
                        source_task_id: task_id.to_string(),
                        source_task_title: "".to_string(),
                        target_task_id: target_task_id.to_string(),
                        target_task_title: "".to_string(),
                        direction: None,
                        note: if include_notes {
                            relationship.note.clone()
                        } else {
                            None
                        },
                    }],
                })
            }
            "update" => {
                let relationship_id = match relationship_id {
                    Some(id) => id,
                    None => {
                        return Self::err("relationship_id is required for 'update' action", None::<&str>);
                    }
                };

                let mut payload = serde_json::json!({});
                if let Some(target_id) = target_task_id {
                    payload["target_task_id"] = serde_json::Value::String(target_id.to_string());
                }
                if let Some(type_name) = relationship_type.clone() {
                    // Get relationship type by name
                    let types_url = self.url("/api/task-relationship-types");
                    let types: Vec<serde_json::Value> = match self.send_json(self.client.get(&types_url)).await {
                        Ok(v) => v,
                        Err(e) => return Ok(e),
                    };

                    let rel_type_id = match types
                        .iter()
                        .find_map(|t| {
                            if t.get("type_name").and_then(|v| v.as_str())? == type_name {
                                t.get("id").and_then(|v| v.as_str()).and_then(|id| Uuid::parse_str(id).ok())
                            } else {
                                None
                            }
                        }) {
                        Some(id) => id,
                        None => {
                            return Self::err(
                                format!("Relationship type '{}' not found", type_name),
                                None::<String>,
                            );
                        }
                    };
                    payload["relationship_type_id"] = serde_json::Value::String(rel_type_id.to_string());
                }
                if let Some(note_val) = note {
                    payload["note"] = serde_json::Value::String(note_val);
                }
                if let Some(data_val) = data {
                    payload["data"] = data_val;
                }

                let url = self.url(&format!(
                    "/api/tasks/{}/relationships/{}",
                    task_id, relationship_id
                ));
                let relationship: TaskRelationship = match self
                    .send_json(self.client.put(&url).json(&payload))
                    .await
                {
                    Ok(v) => v,
                    Err(e) => return Ok(e),
                };
                
                TaskServer::success(&ManageTaskRelationshipsResponse {
                    relationships: vec![TaskRelationshipSummary {
                        relationship_id: relationship_id.to_string(),
                        relationship_type: relationship_type.unwrap_or_default(),
                        relationship_type_display: "".to_string(),
                        source_task_id: task_id.to_string(),
                        source_task_title: "".to_string(),
                        target_task_id: target_task_id.map(|id| id.to_string()).unwrap_or_default(),
                        target_task_title: "".to_string(),
                        direction: None,
                        note: if include_notes {
                            relationship.note.clone()
                        } else {
                            None
                        },
                    }],
                })
            }
            "delete" => {
                let relationship_id = match relationship_id {
                    Some(id) => id,
                    None => {
                        return Self::err("relationship_id is required for 'delete' action", None::<&str>);
                    }
                };

                let url = self.url(&format!(
                    "/api/tasks/{}/relationships/{}",
                    task_id, relationship_id
                ));
                // DELETE endpoint returns ApiResponse<()>, so we handle it specially
                let resp = match self.client.delete(&url).send().await {
                    Ok(resp) => resp,
                    Err(e) => {
                        return Ok(Self::err("Failed to connect to VK API", Some(&e.to_string())).unwrap());
                    }
                };

                if !resp.status().is_success() {
                    let status = resp.status();
                    return Ok(Self::err(format!("VK API returned error status: {}", status), None::<String>).unwrap());
                }

                let api_response: ApiResponseEnvelope<serde_json::Value> = match resp.json().await {
                    Ok(resp) => resp,
                    Err(e) => {
                        return Ok(Self::err("Failed to parse VK API response", Some(&e.to_string())).unwrap());
                    }
                };

                if !api_response.success {
                    let msg = api_response.message.as_deref().unwrap_or("Unknown error");
                    return Ok(Self::err("VK API returned error", Some(msg)).unwrap());
                }

                TaskServer::success(&ManageTaskRelationshipsResponse {
                    relationships: vec![],
                })
            }
            _ => Self::err(
                format!("Invalid action: {}. Must be one of: add, update, delete, list", action),
                None::<String>,
            ),
        }
    }

    #[tool(description = "List all task templates. Optionally filter by group_id.")]
    pub async fn list_task_templates(
        &self,
        Parameters(ListTaskTemplatesRequest {
            group_id,
            search,
        }): Parameters<ListTaskTemplatesRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let mut request = self.client.get(&self.url("/api/task-templates"));
        if let Some(group_id) = group_id {
            request = request.query(&[("group_id", group_id.to_string())]);
        }
        if let Some(search) = search {
            request = request.query(&[("search", search)]);
        }

        let templates: Vec<TaskTemplate> = match self.send_json(request).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        let response = ListTaskTemplatesResponse {
            count: templates.len(),
            templates,
        };

        TaskServer::success(&response)
    }

    #[tool(description = "Get a specific task template by ID or template name.")]
    pub async fn get_task_template(
        &self,
        Parameters(GetTaskTemplateRequest {
            template_id,
            template_name,
        }): Parameters<GetTaskTemplateRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        if template_id.is_none() && template_name.is_none() {
            return Self::err("Either template_id or template_name must be provided".to_string(), None::<String>);
        }

        let url = if let Some(id) = template_id {
            self.url(&format!("/api/task-templates/{}", id))
        } else if let Some(name) = template_name {
            // List all and find by name
            let templates: Vec<TaskTemplate> = match self.send_json(self.client.get(&self.url("/api/task-templates"))).await {
                Ok(t) => t,
                Err(e) => return Ok(e),
            };
            if let Some(template) = templates.into_iter().find(|t| t.template_name == name) {
                let response = GetTaskTemplateResponse { template };
                return TaskServer::success(&response);
            } else {
                return Self::err(format!("Template with name '{}' not found", name), None::<String>);
            }
        } else {
            unreachable!()
        };

        let template: TaskTemplate = match self.send_json(self.client.get(&url)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        let response = GetTaskTemplateResponse { template };
        TaskServer::success(&response)
    }

    #[tool(description = "Create a new task template.")]
    pub async fn create_task_template(
        &self,
        Parameters(CreateTaskTemplateRequest {
            group_id,
            template_name,
            template_title,
            ticket_title,
            ticket_description,
        }): Parameters<CreateTaskTemplateRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let payload = CreateTaskTemplate {
            group_id,
            template_name,
            template_title,
            ticket_title,
            ticket_description,
        };

        let url = self.url("/api/task-templates");
        let template: TaskTemplate = match self.send_json(self.client.post(&url).json(&payload)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        let response = CreateTaskTemplateResponse {
            template_id: template.id.to_string(),
        };
        TaskServer::success(&response)
    }

    #[tool(description = "Update an existing task template. template_id is required!")]
    async fn update_task_template(
        &self,
        Parameters(UpdateTaskTemplateRequest {
            template_id,
            group_id,
            template_name,
            template_title,
            ticket_title,
            ticket_description,
        }): Parameters<UpdateTaskTemplateRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let payload = UpdateTaskTemplate {
            group_id,
            template_name,
            template_title,
            ticket_title,
            ticket_description,
        };

        let url = self.url(&format!("/api/task-templates/{}", template_id));
        let template: TaskTemplate = match self.send_json(self.client.put(&url).json(&payload)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        let response = UpdateTaskTemplateResponse { template };
        TaskServer::success(&response)
    }

    #[tool(description = "Delete a task template. template_id is required!")]
    async fn delete_task_template(
        &self,
        Parameters(DeleteTaskTemplateRequest { template_id }): Parameters<DeleteTaskTemplateRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/task-templates/{}", template_id));
        match self.send_json::<serde_json::Value>(self.client.delete(&url)).await {
            Ok(_) => TaskServer::success(&DeleteTaskTemplateResponse {
                deleted_template_id: Some(template_id.to_string()),
            }),
            Err(e) => Ok(e),
        }
    }

    #[tool(description = "List all task template groups. Set hierarchical=true to get tree structure.")]
    pub async fn list_task_template_groups(
        &self,
        Parameters(ListTaskTemplateGroupsRequest {
            hierarchical,
            parent_id,
            search,
        }): Parameters<ListTaskTemplateGroupsRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let mut request = self.client.get(&self.url("/api/task-template-groups"));
        if hierarchical.unwrap_or(false) {
            request = request.query(&[("hierarchical", "true")]);
        }
        if let Some(parent_id) = parent_id {
            request = request.query(&[("parent_id", parent_id.to_string())]);
        }
        if let Some(search) = search {
            request = request.query(&[("search", search)]);
        }

        let groups: Vec<TaskTemplateGroupWithChildren> = match self.send_json(request).await {
            Ok(g) => g,
            Err(e) => return Ok(e),
        };

        let response = ListTaskTemplateGroupsResponse {
            count: groups.len(),
            groups,
        };

        TaskServer::success(&response)
    }

    #[tool(description = "Get a specific task template group by ID.")]
    async fn get_task_template_group(
        &self,
        Parameters(GetTaskTemplateGroupRequest { group_id }): Parameters<GetTaskTemplateGroupRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/task-template-groups/{}", group_id));
        let group: TaskTemplateGroup = match self.send_json(self.client.get(&url)).await {
            Ok(g) => g,
            Err(e) => return Ok(e),
        };

        let response = GetTaskTemplateGroupResponse { group };
        TaskServer::success(&response)
    }

    #[tool(description = "Create a new task template group.")]
    async fn create_task_template_group(
        &self,
        Parameters(CreateTaskTemplateGroupRequest {
            name,
            parent_group_id,
        }): Parameters<CreateTaskTemplateGroupRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let payload = CreateTaskTemplateGroup {
            name,
            parent_group_id,
        };

        let url = self.url("/api/task-template-groups");
        let group: TaskTemplateGroup = match self.send_json(self.client.post(&url).json(&payload)).await {
            Ok(g) => g,
            Err(e) => return Ok(e),
        };

        let response = CreateTaskTemplateGroupResponse {
            group_id: group.id.to_string(),
        };
        TaskServer::success(&response)
    }

    #[tool(description = "Update an existing task template group. group_id is required!")]
    async fn update_task_template_group(
        &self,
        Parameters(UpdateTaskTemplateGroupRequest {
            group_id,
            name,
            parent_group_id,
        }): Parameters<UpdateTaskTemplateGroupRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let payload = UpdateTaskTemplateGroup {
            name,
            parent_group_id,
        };

        let url = self.url(&format!("/api/task-template-groups/{}", group_id));
        let group: TaskTemplateGroup = match self.send_json(self.client.put(&url).json(&payload)).await {
            Ok(g) => g,
            Err(e) => return Ok(e),
        };

        let response = UpdateTaskTemplateGroupResponse { group };
        TaskServer::success(&response)
    }

    #[tool(description = "Delete a task template group. group_id is required!")]
    async fn delete_task_template_group(
        &self,
        Parameters(DeleteTaskTemplateGroupRequest { group_id }): Parameters<DeleteTaskTemplateGroupRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/task-template-groups/{}", group_id));
        match self.send_json::<serde_json::Value>(self.client.delete(&url)).await {
            Ok(_) => TaskServer::success(&DeleteTaskTemplateGroupResponse {
                deleted_group_id: Some(group_id.to_string()),
            }),
            Err(e) => Ok(e),
        }
    }
}

#[tool_handler]
impl ServerHandler for TaskServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo {
            protocol_version: ProtocolVersion::V_2025_03_26,
            capabilities: ServerCapabilities::builder()
                .enable_tools()
                .build(),
            server_info: Implementation {
                name: "vibe-kanban".to_string(),
                version: "1.0.0".to_string(),
            },
            instructions: Some("A task and project management server. If you need to create or update tickets or tasks then use these tools. Most of them absolutely require that you pass the `project_id` of the project that you are currently working on. This should be provided to you. Call `list_tasks` to fetch the `task_ids` of all the tasks in a project`. TOOLS: 'list_projects', 'list_tasks', 'create_task', 'start_task_attempt', 'get_task', 'update_task', 'delete_task', 'manage_task_relationships', 'list_task_templates', 'get_task_template', 'create_task_template', 'update_task_template', 'delete_task_template', 'list_task_template_groups', 'get_task_template_group', 'create_task_template_group', 'update_task_template_group', 'delete_task_template_group'. Make sure to pass `project_id` or `task_id` where required. You can use list tools to get the available ids.".to_string()),
        }
    }
}
