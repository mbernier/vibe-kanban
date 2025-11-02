import { test, expect } from '@playwright/test';

test.describe('Task Relationships Section', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a task page (using real backend)
    // First, we need to get a real project and task ID
    // For now, let's navigate to projects and use the first available project/task
    await page.goto('/projects');
    
    // Wait for projects to load
    await page.waitForTimeout(1000);
    
    // Click on first project
    const firstProject = page.locator('[href*="/projects/"]').first();
    if (await firstProject.count() > 0) {
      await firstProject.click();
      await page.waitForTimeout(1000);
      
      // Get the first task from the project
      const firstTask = page.locator('[href*="/tasks/"]').first();
      if (await firstTask.count() > 0) {
        await firstTask.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('should display relationships section', async ({ page }) => {
    // Check that relationships section is visible
    await expect(page.locator('text=Relationships')).toBeVisible();
  });

  test('should show empty state when no relationships', async ({ page }) => {
    // Should show "No relationships" message
    await expect(page.locator('text=No relationships')).toBeVisible();
  });

  test('should allow adding a relationship', async ({ page }) => {
    // Click "Add" button
    await page.click('button:has-text("Add")');

    // Should show relationship form
    await expect(page.locator('text=Relationship Type')).toBeVisible();
    await expect(page.locator('text=Target Task')).toBeVisible();

    // Select relationship type
    await page.click('[role="combobox"]');
    await page.click('text=Context Tickets');

    // Search for target task
    const searchInput = page.locator('input[placeholder*="Search tasks"]');
    await searchInput.fill('task-2');
    
    // Wait for search results and select
    await page.waitForSelector('text=Test Task 2', { timeout: 5000 });
    await page.click('text=Test Task 2');

    // Add optional note
    await page.fill('textarea[id="relationship-note"]', 'Test relationship note');

    // Create relationship
    await page.click('button:has-text("Create")');

    // Should show success (relationship appears in list)
    await expect(page.locator('text=Test Task 2')).toBeVisible();
  });

  test('should require target task before creating', async ({ page }) => {
    // Click "Add" button
    await page.click('button:has-text("Add")');

    // Select relationship type
    await page.click('[role="combobox"]');
    await page.click('text=Context Tickets');

    // Try to create without selecting target task
    const createButton = page.locator('button:has-text("Create")');
    await expect(createButton).toBeDisabled();
  });

  test('should cancel adding relationship', async ({ page }) => {
    // Click "Add" button
    await page.click('button:has-text("Add")');

    // Fill some data
    await page.click('[role="combobox"]');
    await page.click('text=Context Tickets');

    // Click cancel
    await page.click('button:has-text("Cancel")');

    // Form should close
    await expect(page.locator('text=Relationship Type')).not.toBeVisible();
  });

  test('should display directional relationships correctly', async ({ page }) => {
    // Setup mock relationships
    const mockRelationships: MockRelationshipGrouped[] = [
      {
        relationship_type: defaultRelationshipTypes[0], // context type
        forward: [
          {
            relationship: {
              id: 'rel-1',
              source_task_id: 'task-1',
              target_task_id: 'task-2',
              relationship_type_id: 'context-type-id',
              relationship_type_name: 'context',
              note: null,
              data: null,
              source_task: mockTask,
              target_task: mockTargetTask,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            source_task: mockTask,
            target_task: mockTargetTask,
          },
        ],
        reverse: [],
      },
    ];

    setupTaskRelationshipsMocks(page, mockRelationships);

    // Reload page to fetch relationships
    await page.reload();

    // Should show forward section with label
    await expect(page.locator('text=provides context for')).toBeVisible();
    await expect(page.locator('text=Test Task 2')).toBeVisible();
  });

  test('should display reverse relationships correctly', async ({ page }) => {
    // Setup mock relationships with reverse relationship
    const mockRelationships: MockRelationshipGrouped[] = [
      {
        relationship_type: defaultRelationshipTypes[0], // context type
        forward: [],
        reverse: [
          {
            relationship: {
              id: 'rel-1',
              source_task_id: 'task-2',
              target_task_id: 'task-1',
              relationship_type_id: 'context-type-id',
              relationship_type_name: 'context',
              note: null,
              data: null,
              source_task: mockTargetTask,
              target_task: mockTask,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            source_task: mockTargetTask,
            target_task: mockTask,
          },
        ],
      },
    ];

    setupTaskRelationshipsMocks(page, mockRelationships);

    // Reload page
    await page.reload();

    // Should show reverse section with label
    await expect(page.locator('text=uses context from')).toBeVisible();
    await expect(page.locator('text=Test Task 2')).toBeVisible();
  });

  test('should display blocking indicator', async ({ page }) => {
    // Setup mock relationships with blocking relationship
    const blockingTask: MockTask = {
      ...mockTargetTask,
      status: 'todo', // In blocking source status
    };

    const mockRelationships: MockRelationshipGrouped[] = [
      {
        relationship_type: defaultRelationshipTypes[1], // blocked type
        forward: [],
        reverse: [
          {
            relationship: {
              id: 'rel-1',
              source_task_id: 'task-2',
              target_task_id: 'task-1',
              relationship_type_id: 'blocked-type-id',
              relationship_type_name: 'blocked',
              note: null,
              data: null,
              source_task: blockingTask,
              target_task: mockTask,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            source_task: blockingTask,
            target_task: mockTask,
          },
        ],
      },
    ];

    setupTaskRelationshipsMocks(page, mockRelationships);

    // Reload page
    await page.reload();

    // Should show blocked badge
    await expect(page.locator('text=Blocked')).toBeVisible();
    
    // Should show blocking message (message includes statuses)
    await expect(page.locator('text=This task is blocked')).toBeVisible();
  });

  test('should delete relationship', async ({ page }) => {
    // Setup mock relationships
    const mockRelationships: MockRelationshipGrouped[] = [
      {
        relationship_type: defaultRelationshipTypes[0],
        forward: [
          {
            relationship: {
              id: 'rel-1',
              source_task_id: 'task-1',
              target_task_id: 'task-2',
              relationship_type_id: 'context-type-id',
              relationship_type_name: 'context',
              note: null,
              data: null,
              source_task: mockTask,
              target_task: mockTargetTask,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            source_task: mockTask,
            target_task: mockTargetTask,
          },
        ],
        reverse: [],
      },
    ];

    setupTaskRelationshipsMocks(page, mockRelationships);

    // Reload page
    await page.reload();

    // Click delete button (Trash2 icon button within the relationship item)
    // Find the relationship item containing the target task, then find the delete button
    const relationshipItem = page.locator('text=Test Task 2').locator('..').locator('..');
    const deleteButton = relationshipItem.locator('button').filter({ has: page.locator('svg') });
    
    // Set up dialog handler before clicking
    page.once('dialog', (dialog) => dialog.accept());
    
    await deleteButton.click();

    // Relationship should be removed
    await expect(page.locator('text=Test Task 2')).not.toBeVisible();
  });

  test('should display relationship notes', async ({ page }) => {
    // Setup mock relationships with note
    const mockRelationships: MockRelationshipGrouped[] = [
      {
        relationship_type: defaultRelationshipTypes[0],
        forward: [
          {
            relationship: {
              id: 'rel-1',
              source_task_id: 'task-1',
              target_task_id: 'task-2',
              relationship_type_id: 'context-type-id',
              relationship_type_name: 'context',
              note: 'This is a test note',
              data: null,
              source_task: mockTask,
              target_task: mockTargetTask,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            source_task: mockTask,
            target_task: mockTargetTask,
          },
        ],
        reverse: [],
      },
    ];

    setupTaskRelationshipsMocks(page, mockRelationships);

    // Reload page
    await page.reload();

    // Should show note
    await expect(page.locator('text=This is a test note')).toBeVisible();
  });

  test('should navigate to related task on click', async ({ page }) => {
    // Setup mock relationships
    const mockRelationships: MockRelationshipGrouped[] = [
      {
        relationship_type: defaultRelationshipTypes[0],
        forward: [
          {
            relationship: {
              id: 'rel-1',
              source_task_id: 'task-1',
              target_task_id: 'task-2',
              relationship_type_id: 'context-type-id',
              relationship_type_name: 'context',
              note: null,
              data: null,
              source_task: mockTask,
              target_task: mockTargetTask,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            source_task: mockTask,
            target_task: mockTargetTask,
          },
        ],
        reverse: [],
      },
    ];

    setupTaskRelationshipsMocks(page, mockRelationships);

    // Reload page
    await page.reload();

    // Click on relationship item
    await page.click('text=Test Task 2');

    // Should navigate to target task
    await expect(page).toHaveURL(/.*task-2/);
  });
});

