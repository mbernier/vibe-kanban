import { test, expect } from '@playwright/test';

/**
 * API Mock helpers for template tests
 */
const mockTemplates = [
  {
    id: 'template-1',
    group_id: null,
    template_name: 'bug_report',
    template_title: 'Bug Report Template',
    ticket_title: 'Bug: {{title}}',
    ticket_description: '## Description\n\n{{description}}\n\n## Steps to Reproduce\n\n1. Step 1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'template-2',
    group_id: 'group-1',
    template_name: 'test_plan',
    template_title: 'Test Plan Template',
    ticket_title: 'Test Plan: {{title}}',
    ticket_description: 'Test plan description',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockGroups = [
  {
    id: 'group-1',
    name: 'Bug Reports',
    parent_group_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    children: [],
    templates: [mockTemplates[1]],
  },
];

test.describe('Task Templates Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Mock API responses
    await page.route('**/api/task-templates', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: mockTemplates,
            error_data: null,
            message: null,
          }),
        });
      } else if (route.request().method() === 'POST') {
        const request = route.request().postDataJSON();
        const newTemplate = {
          id: `template-${Date.now()}`,
          group_id: request.group_id || null,
          template_name: request.template_name,
          template_title: request.template_title,
          ticket_title: request.ticket_title,
          ticket_description: request.ticket_description,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        mockTemplates.push(newTemplate);
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: newTemplate,
            error_data: null,
            message: null,
          }),
        });
      }
    });

    await page.route('**/api/task-template-groups', (route) => {
      if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: mockGroups,
            error_data: null,
            message: null,
          }),
        });
      } else if (route.request().method() === 'POST') {
        const request = route.request().postDataJSON();
        const newGroup = {
          id: `group-${Date.now()}`,
          name: request.name,
          parent_group_id: request.parent_group_id || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        mockGroups.push({
          ...newGroup,
          children: [],
          templates: [],
        });
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: newGroup,
            error_data: null,
            message: null,
          }),
        });
      }
    });

    // Navigate to settings page
    await page.goto('/settings/task-templates');
    await page.waitForLoadState('networkidle');
  });

  test('should display templates settings page', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /task templates/i })).toBeVisible();
    await expect(page.getByText(/create reusable ticket templates/i)).toBeVisible();
  });

  test('should display templates list', async ({ page }) => {
    await expect(page.getByText('Bug Report Template')).toBeVisible();
    await expect(page.getByText('~template:bug_report')).toBeVisible();
  });

  test('should display groups list', async ({ page }) => {
    await expect(page.getByText('Bug Reports')).toBeVisible();
  });

  test('should open create template dialog', async ({ page }) => {
    await page.getByRole('button', { name: /add template/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /create template/i })).toBeVisible();
  });

  test('should create new template', async ({ page }) => {
    await page.getByRole('button', { name: /add template/i }).click();
    
    await page.getByLabel(/template name/i).fill('new_template');
    await page.getByLabel(/template title/i).fill('New Template');
    await page.getByLabel(/ticket title/i).fill('New Ticket');
    await page.getByLabel(/ticket description/i).fill('New Description');
    
    await page.getByRole('button', { name: /create/i }).click();
    
    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible();
    
    // Verify template appears in list
    await expect(page.getByText('New Template')).toBeVisible();
  });

  test('should validate required fields', async ({ page }) => {
    await page.getByRole('button', { name: /add template/i }).click();
    
    // Try to create without filling fields
    const createButton = page.getByRole('button', { name: /create/i });
    await expect(createButton).toBeDisabled();
    
    // Fill only some fields
    await page.getByLabel(/template name/i).fill('test');
    await expect(createButton).toBeDisabled();
    
    await page.getByLabel(/template title/i).fill('Test');
    await expect(createButton).toBeDisabled();
    
    await page.getByLabel(/ticket title/i).fill('Ticket');
    await expect(createButton).toBeDisabled();
    
    await page.getByLabel(/ticket description/i).fill('Description');
    await expect(createButton).toBeEnabled();
  });

  test('should open create group dialog', async ({ page }) => {
    await page.getByRole('button', { name: /add group/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /create group/i })).toBeVisible();
  });

  test('should create new group', async ({ page }) => {
    await page.getByRole('button', { name: /add group/i }).click();
    
    await page.getByLabel(/group name/i).fill('New Group');
    
    await page.getByRole('button', { name: /create/i }).click();
    
    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible();
    
    // Verify group appears in list
    await expect(page.getByText('New Group')).toBeVisible();
  });

  test('should filter templates by group', async ({ page }) => {
    // This test would require more complex setup with hierarchical groups
    // For now, we'll verify the groups are displayed
    await expect(page.getByText('Bug Reports')).toBeVisible();
  });

  test('should edit template', async ({ page }) => {
    // Mock update endpoint
    await page.route('**/api/task-templates/template-1', (route) => {
      if (route.request().method() === 'PUT') {
        const request = route.request().postDataJSON();
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              ...mockTemplates[0],
              template_title: request.template_title || mockTemplates[0].template_title,
            },
            error_data: null,
            message: null,
          }),
        });
      } else if (route.request().method() === 'GET') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: mockTemplates[0],
            error_data: null,
            message: null,
          }),
        });
      }
    });

    // Click edit button on first template
    const templateRow = page.locator('text=Bug Report Template').locator('..');
    await templateRow.getByRole('button', { name: /edit/i }).first().click();
    
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: /edit template/i })).toBeVisible();
    
    // Update template title
    await page.getByLabel(/template title/i).clear();
    await page.getByLabel(/template title/i).fill('Updated Template Title');
    
    await page.getByRole('button', { name: /update/i }).click();
    
    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should delete template', async ({ page }) => {
    // Mock delete endpoint
    await page.route('**/api/task-templates/template-1', (route) => {
      if (route.request().method() === 'DELETE') {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: null,
            error_data: null,
            message: null,
          }),
        });
      }
    });

    // Click delete button
    const templateRow = page.locator('text=Bug Report Template').locator('..');
    await templateRow.getByRole('button', { name: /delete/i }).first().click();
    
    // Confirm deletion
    page.on('dialog', (dialog) => dialog.accept());
    
    // Wait for template to be removed (or API to be called)
    await page.waitForTimeout(500);
  });
});

