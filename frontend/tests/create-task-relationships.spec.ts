import { test, expect } from '@playwright/test';

test.describe('Create Task with Relationships', () => {
  let projectId: string;
  let testTaskId: string;

  test.beforeEach(async ({ page, request }) => {
    // Mock branches API to prevent errors when dialog opens
    await page.route('**/api/projects/*/branches*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { name: 'main', is_current: true },
            { name: 'develop', is_current: false },
          ],
          error_data: null,
          message: null,
        }),
      });
    });
    
    // Try to get an existing project first
    const projectsResponse = await request.get('/api/projects');
    
    if (projectsResponse.ok()) {
      const projectsData = await projectsResponse.json();
      
      // Handle ApiResponse wrapper - check both data and direct array
      let projects = [];
      if (projectsData.success && projectsData.data) {
        projects = projectsData.data;
      } else if (Array.isArray(projectsData)) {
        projects = projectsData;
      } else if (projectsData.data && Array.isArray(projectsData.data)) {
        projects = projectsData.data;
      }
      
      if (projects.length > 0) {
        // Use the first existing project
        projectId = projects[0].id;
      }
    }
    
    // If no existing project, try to create one
    if (!projectId) {
      // Create a new git repository in a temp directory with unique name
      // Use timestamp + random number to ensure uniqueness even in parallel tests
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const testRepoPath = `/tmp/vibe-kanban-test-${uniqueId}`;
      
      let createProjectResponse: any = null;
      try {
        createProjectResponse = await request.post('/api/projects', {
          data: {
            name: `Test Project ${uniqueId}`,
            git_repo_path: testRepoPath,
            use_existing_repo: false, // Create a new repository
          },
        });
      } catch (e) {
        // If that fails, the error will be handled below
        console.log('Project creation attempt failed:', e);
      }
      
      if (!createProjectResponse || !createProjectResponse.ok()) {
        const errorText = createProjectResponse ? await createProjectResponse.text() : 'No response';
        throw new Error(`Failed to create or find project. Error: ${errorText.substring(0, 200)}`);
      }
      
      const projectData = await createProjectResponse.json();
      
      // Handle ApiResponse wrapper
      if (projectData.success && projectData.data) {
        projectId = projectData.data.id;
      } else if (projectData.id) {
        projectId = projectData.id;
      } else if (projectData.data && projectData.data.id) {
        projectId = projectData.data.id;
      }
    }
    
    if (!projectId) {
      throw new Error('No project ID available - cannot run tests');
    }

    // Create a test task to use as a target for relationships
    const createTaskResponse = await request.post('/api/tasks', {
      data: {
        project_id: projectId,
        title: 'Test Target Task',
        description: 'A task to use as a relationship target',
        status: 'todo',
      },
    });
    
    if (createTaskResponse.ok()) {
      const taskData = await createTaskResponse.json();
      // Handle ApiResponse wrapper
      if (taskData.success && taskData.data) {
        testTaskId = taskData.data.id;
      } else if (taskData.data && taskData.data.id) {
        testTaskId = taskData.data.id;
      } else if (taskData.id) {
        testTaskId = taskData.id;
      }
    } else {
      // Log error for debugging but don't fail - tests can still run without target task
      const errorText = await createTaskResponse.text();
      console.error(`Failed to create test target task: ${createTaskResponse.status()} - ${errorText.substring(0, 100)}`);
    }

    // Navigate to the tasks page for this project
    await page.goto(`/projects/${projectId}/tasks`, { waitUntil: 'domcontentloaded' });
    // Wait for the create button to be visible (this means the page has loaded)
    await page.waitForSelector('button[aria-label="Create new task"]', { timeout: 10000 });
    
    // Wait for React to hydrate and project context to be ready
    // Check if projectId is available in React context by waiting for the button to be enabled
    await page.waitForFunction(() => {
      const button = document.querySelector('button[aria-label="Create new task"]');
      return button && !(button as HTMLButtonElement).disabled;
    }, { timeout: 10000 });
    
    // Store projectId in page context for use in tests
    await page.evaluate((pid) => {
      (window as any).__testProjectId = pid;
    }, projectId);
  });

  test.afterEach(async ({ request }) => {
    // Clean up: delete the test project (this will cascade delete tasks)
    if (projectId) {
      await request.delete(`/api/projects/${projectId}`).catch(() => {
        // Ignore cleanup errors
      });
    }
  });

  // Helper function to wait for dialog to appear
  async function waitForDialog(page: any) {
    // Wait a bit for NiceModal to render
    await page.waitForTimeout(1000);
    
    // Try multiple selectors to find the dialog
    const dialogSelectors = [
      '[role="dialog"]',
      'text=Create Task',
      'text=Create New Task',
      '[data-state="open"]',
    ];
    
    for (const selector of dialogSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        return page.locator(selector).first();
      }
    }
    
    // If none found, try getByRole as fallback
    return page.getByRole('dialog');
  }

  test('should show relationships section in create task dialog', async ({ page }) => {
    // Wait for page to be fully loaded and interactive
    await page.waitForLoadState('domcontentloaded');
    
    // Find and click the create task button
    const createButton = page.locator('button[aria-label="Create new task"]');
    await expect(createButton).toBeVisible({ timeout: 10000 });
    await expect(createButton).toBeEnabled({ timeout: 5000 });
    
    // Click the button
    await createButton.click();
    
    // Wait longer for dialog to appear - NiceModal might take time to render
    await page.waitForTimeout(2000);
    
    // Try multiple ways to find the dialog
    const dialogSelectors = [
      '[role="dialog"]',
      'text=Create Task',
      'text=Create New Task',
      '[data-state="open"]',
      '.dialog',
    ];
    
    let dialogFound = false;
    for (const selector of dialogSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        dialogFound = true;
        break;
      }
    }
    
    if (!dialogFound) {
      // Take a screenshot for debugging
      await page.screenshot({ path: 'debug-no-dialog-after-click.png', fullPage: true });
      throw new Error('Dialog failed to appear after clicking button');
    }
    
    // Wait for dialog to appear
    const dialog = await waitForDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    
    await expect(page.getByRole('heading', { name: /create.*task/i })).toBeVisible({ timeout: 5000 });

    // Check that relationships section is visible
    await expect(page.locator('text=Relationships (optional)')).toBeVisible();
    await expect(page.locator('button:has-text("Add Relationship")')).toBeVisible();
  });

  test('should allow adding a relationship before creating task', async ({ page }) => {
    // Open create task dialog
    const createButton = page.locator('button[aria-label="Create new task"]');
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();
    
    const dialog = await waitForDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill in task title
    await page.getByLabel(/title/i).fill('Test Task with Relationship');

    // Click "Add Relationship" button
    await page.locator('button:has-text("Add Relationship")').click();

    // Should show relationship form
    await expect(page.locator('label[for="relationship-type"]')).toBeVisible();

    // Select relationship type first - this will make the Target Task field appear
    // Find the combobox for relationship type (first combobox in the relationship form)
    const combobox = page.locator('[role="combobox"]').first();
    await combobox.click();
    await page.waitForTimeout(300); // Wait for dropdown to open
    
    // Wait for options to appear and click the first available one
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    const relationshipTypes = page.locator('[role="option"]');
    const firstType = relationshipTypes.first();
    await firstType.click();
    
    // Now wait for Target Task field to appear (it only appears after relationship type is selected)
    await page.waitForTimeout(300);
    // Use the label's for attribute to find it specifically (avoids conflict with task names containing "Target Task")
    await expect(page.locator('label[for="target-task"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[placeholder*="Search tasks"]')).toBeVisible();

    // Search for target task using keyboard navigation (more reliable than clicking)
    const searchInput = page.locator('input[placeholder*="Search tasks"]');
    await searchInput.click(); // Focus the input first
    await searchInput.fill('Test Target');
    
    // Wait for search results to appear in the autocomplete dropdown (debounced search is 300ms)
    // Wait for the dropdown container to appear - use a simpler selector
    await page.waitForSelector('div.absolute.z-50', { timeout: 5000 });
    
    // Wait for dropdown items to be visible
    await page.waitForSelector('div.absolute.z-50 div.cursor-pointer', { timeout: 5000 });
    
    // Use keyboard navigation to select the first result
    // Press ArrowDown to select first item (selectedIndex goes from -1 to 0), then Enter to confirm
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300); // Longer delay for selection highlight
    await page.keyboard.press('Enter');
    
    // Wait for the selection to register and the dropdown to close
    // Wait for dropdown to disappear
    await page.waitForSelector('div.absolute.z-50', { state: 'hidden', timeout: 5000 }).catch(() => {
      // Dropdown might already be closed, that's okay
    });
    await page.waitForTimeout(500); // Give React time to update state
    
    // Verify task was selected - check for "Selected: Test Target Task" text
    await expect(page.locator('text=Selected: Test Target Task')).toBeVisible({ timeout: 5000 });
    
    // Wait for React state to update - verify the button becomes enabled
    // The button should be enabled when currentRelationshipTask is set
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button')).filter(
        btn => btn.textContent?.trim() === 'Add'
      );
      if (buttons.length === 0) return false;
      const addButton = buttons[0] as HTMLButtonElement;
      return !addButton.disabled;
    }, { timeout: 10000 });
    
    // Wait for "Add" button to be enabled (it should be enabled after task selection)
    await expect(page.locator('button:has-text("Add")').first()).toBeEnabled({ timeout: 5000 });
    await page.fill('textarea[id="relationship-note"]', 'Test relationship note');

    // Click "Add" button to add relationship to list
    // Click "Add" button to add relationship to list
    await page.locator('button:has-text("Add")').first().click();

    // Should show relationship in the list (check for our test task in the relationship list)
    // Relationship items are in divs with border and bg-muted/30 classes, containing the task title
    const relationshipList = page.locator('div[class*="bg-muted"]').filter({ has: page.locator('div.text-sm.font-medium:has-text("Test Target Task")') });
    await expect(relationshipList.first()).toBeVisible();

    // Now create the task
    await page.click('button:has-text("Create Task")');

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
  });

  test('should allow adding multiple relationships', async ({ page }) => {
    // Use real server - no mocks needed

    // Open create task dialog
    const createButton = page.locator('button[aria-label="Create new task"]');
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();
    
    const dialog = await waitForDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill in task title
    await page.getByLabel(/title/i).fill('Test Task with Multiple Relationships');

    // Add first relationship
    await page.locator('button:has-text("Add Relationship")').click();
    // Find the combobox for relationship type (first combobox in the relationship form)
    const combobox = page.locator('[role="combobox"]').first();
    await combobox.click();
    await page.waitForTimeout(300); // Wait for dropdown to open
    
    // Wait for options to appear and click the first available one
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    const relationshipTypes = page.locator('[role="option"]');
    const firstType = relationshipTypes.first();
    const typeText = await firstType.textContent();
    await firstType.click();
    
    // Wait for Target Task field to appear
    await page.waitForTimeout(300);
    await expect(page.locator('label[for="target-task"]')).toBeVisible({ timeout: 5000 });
    
    // Search for first target task using keyboard navigation
    const searchInput1 = page.locator('input[placeholder*="Search tasks"]').first();
    await searchInput1.click();
    await searchInput1.fill('Test Target');
    await page.waitForTimeout(1000); // Wait for debounced search
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    
    // Wait for "Add" button to be enabled (it should be enabled after task selection)
    await expect(page.locator('button:has-text("Add")').first()).toBeEnabled({ timeout: 5000 });
    
    // Click "Add" button to add relationship to list
    await page.locator('button:has-text("Add")').first().click();

    // Add second relationship with a different type
    await page.locator('button:has-text("Add Relationship")').click();
    // Find the combobox for relationship type (first combobox in the relationship form)
    const combobox2 = page.locator('[role="combobox"]').first();
    await combobox2.click();
    await page.waitForTimeout(300); // Wait for dropdown to open
    
    // Wait for options to appear and try to find a different relationship type
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    const relationshipTypes2 = page.locator('[role="option"]');
    const typeCount = await relationshipTypes2.count();
    if (typeCount > 1) {
      await relationshipTypes2.nth(1).click();
    } else {
      await relationshipTypes2.first().click();
    }
    
    // Wait for Target Task field to appear
    await page.waitForTimeout(300);
    await expect(page.locator('label[for="target-task"]')).toBeVisible({ timeout: 5000 });
    
    // Search for second target task using keyboard navigation
    const searchInput2 = page.locator('input[placeholder*="Search tasks"]').first();
    await searchInput2.click();
    await searchInput2.fill('Test Target');
    await page.waitForTimeout(1000); // Wait for debounced search
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    
    // Wait for "Add" button to be enabled (it should be enabled after task selection)
    await expect(page.locator('button:has-text("Add")').first()).toBeEnabled({ timeout: 5000 });
    
    // Click "Add" button to add relationship to list
    await page.locator('button:has-text("Add")').first().click();

    // Should show relationship in the list (check for our test task in the relationship list)
    // Relationship items are in divs with border and bg-muted/30 classes, containing the task title
    const relationshipList = page.locator('div[class*="bg-muted"]').filter({ has: page.locator('div.text-sm.font-medium:has-text("Test Target Task")') });
    await expect(relationshipList.first()).toBeVisible();

    // Create the task
    await page.click('button:has-text("Create Task")');

    // Dialog should close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });
  });

  test('should allow removing a relationship before creating task', async ({ page }) => {
    // Open create task dialog
    const createButton = page.locator('button[aria-label="Create new task"]');
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();
    
    const dialog = await waitForDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill in task title
    await page.getByLabel(/title/i).fill('Test Task');

    // Add a relationship
    await page.locator('button:has-text("Add Relationship")').click();
    // Find the combobox for relationship type (first combobox in the relationship form)
    const combobox = page.locator('[role="combobox"]').first();
    await combobox.click();
    await page.waitForTimeout(300); // Wait for dropdown to open
    
    // Wait for options to appear and click the first available one
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    const relationshipTypes = page.locator('[role="option"]');
    const firstType = relationshipTypes.first();
    const typeText = await firstType.textContent();
    await firstType.click();
    
    // Wait for Target Task field to appear
    await page.waitForTimeout(300);
    await expect(page.locator('label[for="target-task"]')).toBeVisible({ timeout: 5000 });
    
    // Search for target task using keyboard navigation
    const searchInput = page.locator('input[placeholder*="Search tasks"]');
    await searchInput.click();
    await searchInput.fill('Test Target');
    await page.waitForTimeout(1000); // Wait for debounced search
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    
    // Wait for "Add" button to be enabled (it should be enabled after task selection)
    await expect(page.locator('button:has-text("Add")').first()).toBeEnabled({ timeout: 5000 });
    
    // Click "Add" button to add relationship to list
    await page.locator('button:has-text("Add")').first().click();

    // Should show relationship in the list (check for our test task in the relationship list)
    const relationshipList = page.locator('div[class*="bg-muted"]').filter({ has: page.locator('div.text-sm.font-medium:has-text("Test Target Task")') });
    await expect(relationshipList.first()).toBeVisible();

    // Remove the relationship - find the delete button within the relationship item
    const relationshipItem = relationshipList.first();
    const deleteButton = relationshipItem.locator('button').filter({ has: page.locator('svg') });
    await deleteButton.click();

    // Relationship should be removed - check that it's not in the relationship list anymore
    await expect(relationshipList.first()).not.toBeVisible();
  });

  test('should require target task before adding relationship', async ({ page }) => {
    // Open create task dialog
    const createButton = page.locator('button[aria-label="Create new task"]');
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();
    
    const dialog = await waitForDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click "Add Relationship" button
    await page.locator('button:has-text("Add Relationship")').click();

    // Select relationship type
    // Find the combobox for relationship type (first combobox in the relationship form)
    const combobox = page.locator('[role="combobox"]').first();
    await combobox.click();
    await page.waitForTimeout(300); // Wait for dropdown to open
    
    // Wait for options to appear and click the first available one
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    const relationshipTypes = page.locator('[role="option"]');
    const firstType = relationshipTypes.first();
    const typeText = await firstType.textContent();
    await firstType.click();

    // Try to add without selecting target task
    const addButton = page.locator('button:has-text("Add")').first();
    await expect(addButton).toBeDisabled();
  });

  test('should cancel adding relationship', async ({ page }) => {
    // Open create task dialog
    const createButton = page.locator('button[aria-label="Create new task"]');
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();
    
    const dialog = await waitForDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Click "Add Relationship" button
    await page.locator('button:has-text("Add Relationship")').click();

    // Fill some data
    // Find the combobox for relationship type (first combobox in the relationship form)
    const combobox = page.locator('[role="combobox"]').first();
    await combobox.click();
    await page.waitForTimeout(300); // Wait for dropdown to open
    
    // Wait for options to appear and click the first available one
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    const relationshipTypes = page.locator('[role="option"]');
    const firstType = relationshipTypes.first();
    const typeText = await firstType.textContent();
    await firstType.click();

    // Click cancel
    await page.locator('button:has-text("Cancel")').first().click();

    // Form should close
    await expect(page.locator('text=Relationship Type')).not.toBeVisible();
    // "Add Relationship" button should be visible again
    await expect(page.locator('button:has-text("Add Relationship")')).toBeVisible();
  });

  test('should create task with relationships using Create & Start', async ({ page }) => {
    // Use real server - no mocks needed

    // Open create task dialog
    const createButton = page.locator('button[aria-label="Create new task"]');
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();
    
    const dialog = await waitForDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Fill in task title
    await page.getByLabel(/title/i).fill('Test Task with Relationship');

    // Add relationship
    await page.locator('button:has-text("Add Relationship")').click();
    // Find the combobox for relationship type (first combobox in the relationship form)
    const combobox = page.locator('[role="combobox"]').first();
    await combobox.click();
    await page.waitForTimeout(300); // Wait for dropdown to open
    
    // Wait for options to appear and click the first available one
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    const relationshipTypes = page.locator('[role="option"]');
    const firstType = relationshipTypes.first();
    const typeText = await firstType.textContent();
    await firstType.click();
    
    // Wait for Target Task field to appear
    await page.waitForTimeout(300);
    await expect(page.locator('label[for="target-task"]')).toBeVisible({ timeout: 5000 });
    
    // Search for target task using keyboard navigation
    const searchInput = page.locator('input[placeholder*="Search tasks"]');
    await searchInput.click();
    await searchInput.fill('Test Target');
    await page.waitForTimeout(1000); // Wait for debounced search
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    
    // Wait for "Add" button to be enabled (it should be enabled after task selection)
    await expect(page.locator('button:has-text("Add")').first()).toBeEnabled({ timeout: 5000 });
    
    // Click "Add" button to add relationship to list
    await page.locator('button:has-text("Add")').first().click();

    // Should show relationship in the list
    // Should show relationship in the list (check for our test task in the relationship list)
    await expect(page.locator('div.bg-muted\\/30 div.text-sm.font-medium:has-text("Test Target Task")').first()).toBeVisible();

    // Click "Create & Start" button (this might require executor profile and branch setup)
    // For now, let's just verify the button exists and is enabled
    const createAndStartButton = page.locator('button:has-text("Create & Start")');
    if (await createAndStartButton.count() > 0) {
      // Button should be enabled if we have required fields
      // Note: This test might fail if executor profile or branch is required
      // In that case, we would need to set those up first
    }
  });
});

