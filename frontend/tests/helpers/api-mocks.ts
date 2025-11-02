/**
 * API Mock helpers for Playwright tests
 * These functions help mock API responses for testing the UI
 */

export interface MockRelationshipType {
  id: string;
  type_name: string;
  display_name: string;
  description?: string | null;
  is_system: boolean;
  is_directional: boolean;
  forward_label?: string | null;
  reverse_label?: string | null;
  enforces_blocking: boolean;
  blocking_disabled_statuses?: string[];
  blocking_source_statuses?: string[];
  created_at: string;
  updated_at: string;
}

export interface MockTask {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  project_id: string;
  created_at: string;
  updated_at: string;
}

export interface MockRelationship {
  id: string;
  source_task_id: string;
  target_task_id: string;
  relationship_type_id: string;
  relationship_type_name: string;
  note?: string | null;
  data?: Record<string, any> | null;
  source_task?: MockTask;
  target_task?: MockTask;
  relationship_type?: MockRelationshipType;
  created_at: string;
  updated_at: string;
}

export interface MockRelationshipGrouped {
  relationship_type: MockRelationshipType;
  forward: Array<{ relationship: MockRelationship; source_task: MockTask; target_task: MockTask }>;
  reverse: Array<{ relationship: MockRelationship; source_task: MockTask; target_task: MockTask }>;
}

/**
 * Default system relationship types for testing
 */
export const defaultRelationshipTypes: MockRelationshipType[] = [
  {
    id: 'context-type-id',
    type_name: 'context',
    display_name: 'Context Tickets',
    description: 'Tickets that provide context',
    is_system: true,
    is_directional: true,
    forward_label: 'provides context for',
    reverse_label: 'uses context from',
    enforces_blocking: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'blocked-type-id',
    type_name: 'blocked',
    display_name: 'Blocked Tickets',
    description: 'Tickets that must come before',
    is_system: true,
    is_directional: true,
    forward_label: 'blocks',
    reverse_label: 'blocked by',
    enforces_blocking: true,
    blocking_disabled_statuses: ['todo', 'inreview', 'done', 'cancelled'],
    blocking_source_statuses: ['todo', 'inprogress', 'inreview'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

/**
 * Setup API route handlers for relationship types
 */
export function setupRelationshipTypesMocks(page: any, types: MockRelationshipType[] = defaultRelationshipTypes) {
  // Store types in a mutable array that can be updated
  let typesList = [...types];

  // Handle all methods for /api/task-relationship-types (list endpoint)
  // Match with or without query parameters - use more specific pattern
  page.route('**/api/task-relationship-types', (route: any) => {
    const method = route.request().method();
    const url = route.request().url();
    
    // Skip if this is a request for a specific ID (handled by the other route)
    if (url.match(/\/api\/task-relationship-types\/[^/?]+/)) {
      route.continue();
      return;
    }
    
    if (method === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(typesList),
      });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON();
      const newType: MockRelationshipType = {
        id: `new-type-${Date.now()}`,
        type_name: body.type_name,
        display_name: body.display_name,
        description: body.description || null,
        is_system: false,
        is_directional: body.is_directional || false,
        forward_label: body.forward_label || null,
        reverse_label: body.reverse_label || null,
        enforces_blocking: body.enforces_blocking || false,
        blocking_disabled_statuses: body.blocking_disabled_statuses || null,
        blocking_source_statuses: body.blocking_source_statuses || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      typesList.push(newType);
      
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newType),
      });
    } else {
      route.continue();
    }
  });

  // Handle all methods for /api/task-relationship-types/:id (item endpoint)
  page.route('**/api/task-relationship-types/*', (route: any) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const id = url.pathname.split('/').pop();
    const typeIndex = typesList.findIndex((t) => t.id === id);
    const type = typesList[typeIndex];
    
    if (method === 'GET') {
      if (type) {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(type),
        });
      } else {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Not found' }),
        });
      }
    } else if (method === 'PUT') {
      if (typeIndex !== -1) {
        const body = route.request().postDataJSON();
        const updatedType: MockRelationshipType = {
          ...typesList[typeIndex],
          ...body,
          updated_at: new Date().toISOString(),
        };
        typesList[typeIndex] = updatedType;
        
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(updatedType),
        });
      } else {
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Not found' }),
        });
      }
    } else if (method === 'DELETE') {
      if (type && !type.is_system) {
        typesList = typesList.filter((t) => t.id !== id);
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true }),
        });
      } else {
        route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Cannot delete system type' }),
        });
      }
    } else {
      route.continue();
    }
  });
}

/**
 * Setup API route handlers for task relationships
 */
export function setupTaskRelationshipsMocks(
  page: any,
  relationships: MockRelationshipGrouped[] = []
) {
  // Mock GET /api/tasks/:id/relationships
  page.route('**/api/tasks/*/relationships', (route: any) => {
    if (route.request().method() === 'GET') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(relationships),
      });
    } else {
      route.continue();
    }
  });

  // Mock POST /api/tasks/:id/relationships
  page.route('**/api/tasks/*/relationships', (route: any) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const newRelationship: MockRelationship = {
        id: `rel-${Date.now()}`,
        source_task_id: 'task-1',
        target_task_id: body.target_task_id,
        relationship_type_id: 'type-id',
        relationship_type_name: body.relationship_type,
        note: body.note || null,
        data: body.data || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(newRelationship),
      });
    } else {
      route.continue();
    }
  });

  // Mock DELETE /api/tasks/:id/relationships/:relId
  page.route('**/api/tasks/*/relationships/*', (route: any) => {
    if (route.request().method() === 'DELETE') {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      route.continue();
    }
  });

  // Mock task search
  page.route('**/api/tasks/search*', (route: any) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get('query') || '';
    
    const mockTasks: MockTask[] = [
      {
        id: 'task-2',
        title: 'Test Task 2',
        description: 'Another test task',
        status: 'todo',
        project_id: 'project-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'task-3',
        title: 'Test Task 3',
        description: 'Yet another test task',
        status: 'inprogress',
        project_id: 'project-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ].filter((task) => 
      task.title.toLowerCase().includes(query.toLowerCase()) ||
      task.id.includes(query)
    );
    
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockTasks),
    });
  });
}

/**
 * Setup API route handlers for tasks
 */
export function setupTaskMocks(page: any, task: MockTask) {
  // Mock GET /api/tasks/:id
  page.route(`**/api/tasks/${task.id}`, (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(task),
    });
  });
}

