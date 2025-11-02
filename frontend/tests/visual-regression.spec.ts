import { test, expect } from '@playwright/test';
import {
  setupRelationshipTypesMocks,
  setupTaskRelationshipsMocks,
  setupTaskMocks,
  defaultRelationshipTypes,
  type MockTask,
  type MockRelationshipGrouped,
} from './helpers/api-mocks';

test.describe('Visual Regression Tests', () => {
  test('relationship types manager should match snapshot', async ({ page }) => {
    setupRelationshipTypesMocks(page);

    await page.goto('/settings/relationship-types');

    // Take screenshot of the relationship types manager
    const manager = page.locator('[data-testid="relationship-types-manager"]');
    await expect(manager).toBeVisible();

    await expect(page).toHaveScreenshot('relationship-types-manager.png', {
      fullPage: false,
    });
  });

  test('relationship type edit dialog should match snapshot', async ({ page }) => {
    setupRelationshipTypesMocks(page);

    await page.goto('/settings/relationship-types');
    await page.click('button:has-text("Add Type")');

    // Wait for dialog to appear
    await expect(page.locator('text=Create Relationship Type')).toBeVisible();

    // Fill in form
    await page.fill('input[id="type-name"]', 'test-type');
    await page.fill('input[id="display-name"]', 'Test Type');
    await page.check('input[id="is_directional"]');
    await page.fill('input[id="forward-label"]', 'relates to');
    await page.fill('input[id="reverse-label"]', 'related from');

    // Take screenshot
    await expect(page).toHaveScreenshot('relationship-type-edit-dialog.png', {
      fullPage: false,
    });
  });

  test('blocking configuration section should match snapshot', async ({ page }) => {
    setupRelationshipTypesMocks(page);

    await page.goto('/settings/relationship-types');
    await page.click('button:has-text("Add Type")');

    // Fill basic info
    await page.fill('input[id="type-name"]', 'blocks');
    await page.fill('input[id="display-name"]', 'Blocks');

    // Enable blocking
    await page.check('input[id="enforces_blocking"]');

    // Scroll to blocking section
    const blockingSection = page.locator('text=Blocked Statuses').locator('..');
    await blockingSection.scrollIntoViewIfNeeded();

    // Take screenshot
    await expect(page).toHaveScreenshot('blocking-configuration.png', {
      fullPage: false,
    });
  });

  test('task relationships section should match snapshot', async ({ page }) => {
    setupRelationshipTypesMocks(page);
    setupTaskMocks(page, {
      id: 'task-1',
      title: 'Test Task',
      status: 'todo',
      project_id: 'project-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

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
              note: 'Test note',
              data: null,
              source_task: {
                id: 'task-1',
                title: 'Test Task',
                status: 'todo',
                project_id: 'project-1',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              target_task: {
                id: 'task-2',
                title: 'Related Task',
                status: 'inprogress',
                project_id: 'project-1',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            source_task: {
              id: 'task-1',
              title: 'Test Task',
              status: 'todo',
              project_id: 'project-1',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            target_task: {
              id: 'task-2',
              title: 'Related Task',
              status: 'inprogress',
              project_id: 'project-1',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          },
        ],
        reverse: [],
      },
    ];

    setupTaskRelationshipsMocks(page, mockRelationships);

    await page.goto('/projects/project-1/tasks/task-1');

    // Wait for relationships section to load
    await expect(page.locator('text=Relationships')).toBeVisible();

    // Take screenshot
    await expect(page).toHaveScreenshot('task-relationships-section.png', {
      fullPage: false,
    });
  });

  test('blocked indicator should match snapshot', async ({ page }) => {
    setupRelationshipTypesMocks(page);
    setupTaskMocks(page, {
      id: 'task-1',
      title: 'Test Task',
      status: 'todo',
      project_id: 'project-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const blockingTask: MockTask = {
      id: 'task-2',
      title: 'Blocking Task',
      status: 'todo',
      project_id: 'project-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
              target_task: {
                id: 'task-1',
                title: 'Test Task',
                status: 'todo',
                project_id: 'project-1',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            source_task: blockingTask,
            target_task: {
              id: 'task-1',
              title: 'Test Task',
              status: 'todo',
              project_id: 'project-1',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          },
        ],
      },
    ];

    setupTaskRelationshipsMocks(page, mockRelationships);

    await page.goto('/projects/project-1/tasks/task-1');

    // Wait for blocked indicator
    await expect(page.locator('text=Blocked')).toBeVisible();

    // Take screenshot
    await expect(page).toHaveScreenshot('blocked-indicator.png', {
      fullPage: false,
    });
  });
});

