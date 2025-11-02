import { test, expect } from '@playwright/test';
import {
  setupRelationshipTypesMocks,
  setupTaskRelationshipsMocks,
  setupTaskMocks,
  defaultRelationshipTypes,
  type MockTask,
  type MockRelationshipGrouped,
} from './helpers/api-mocks';

test.describe('Accessibility Tests', () => {
  test('relationship types settings should be keyboard accessible', async ({ page }) => {
    setupRelationshipTypesMocks(page);

    await page.goto('/settings/relationship-types');

    // Tab through interactive elements
    await page.keyboard.press('Tab');
    
    // Should focus on "Add Type" button
    const addButton = page.locator('button:has-text("Add Type")');
    await expect(addButton).toBeFocused();

    // Press Enter to open dialog
    await page.keyboard.press('Enter');

    // Dialog should open
    await expect(page.locator('text=Create Relationship Type')).toBeVisible();

    // Tab through form fields
    await page.keyboard.press('Tab');
    const typeNameInput = page.locator('input[id="type-name"]');
    await expect(typeNameInput).toBeFocused();
  });

  test('relationship types table should be keyboard navigable', async ({ page }) => {
    setupRelationshipTypesMocks(page);

    await page.goto('/settings/relationship-types');

    // Tab to edit button
    await page.keyboard.press('Tab'); // Add Type button
    await page.keyboard.press('Tab'); // First edit button
    
    // Should focus on edit button
    const editButton = page.locator('button[title*="Edit"]').first();
    await expect(editButton).toBeFocused();

    // Press Enter to open edit dialog
    await page.keyboard.press('Enter');
    await expect(page.locator('text=Edit Relationship Type')).toBeVisible();
  });

  test('task relationships section should be keyboard accessible', async ({ page }) => {
    setupRelationshipTypesMocks(page);
    setupTaskMocks(page, {
      id: 'task-1',
      title: 'Test Task',
      status: 'todo',
      project_id: 'project-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setupTaskRelationshipsMocks(page, []);

    await page.goto('/projects/project-1/tasks/task-1');

    // Tab to "Add" button
    await page.keyboard.press('Tab');
    const addButton = page.locator('button:has-text("Add")');
    await expect(addButton).toBeFocused();

    // Press Enter to open form
    await page.keyboard.press('Enter');
    await expect(page.locator('text=Relationship Type')).toBeVisible();
  });

  test('forms should have proper labels', async ({ page }) => {
    setupRelationshipTypesMocks(page);

    await page.goto('/settings/relationship-types');
    await page.click('button:has-text("Add Type")');

    // Check that inputs have associated labels
    const typeNameInput = page.locator('input[id="type-name"]');
    const typeNameLabel = page.locator('label[for="type-name"]');
    await expect(typeNameLabel).toBeVisible();
    await expect(typeNameLabel).toContainText('Type Name');

    const displayNameInput = page.locator('input[id="display-name"]');
    const displayNameLabel = page.locator('label[for="display-name"]');
    await expect(displayNameLabel).toBeVisible();
    await expect(displayNameLabel).toContainText('Display Name');
  });

  test('should announce errors to screen readers', async ({ page }) => {
    setupRelationshipTypesMocks(page);

    await page.goto('/settings/relationship-types');
    await page.click('button:has-text("Add Type")');

    // Try to save without filling required fields
    await page.click('button:has-text("Create")');

    // Error should be visible
    const errorMessage = page.locator('text=Type name is required');
    await expect(errorMessage).toBeVisible();

    // Input should have aria-invalid
    const typeNameInput = page.locator('input[id="type-name"]');
    await expect(typeNameInput).toHaveAttribute('aria-invalid', 'true');
  });

  test('should have proper ARIA attributes on buttons', async ({ page }) => {
    setupRelationshipTypesMocks(page);

    await page.goto('/settings/relationship-types');

    // Edit button should have title/tooltip
    const editButton = page.locator('button[title*="Edit"]').first();
    await expect(editButton).toHaveAttribute('title', /Edit/i);

    // Delete button should have title/tooltip
    const deleteButton = page.locator('button[title*="Delete"]').first();
    await expect(deleteButton).toHaveAttribute('title', /Delete/i);
  });

  test('should support screen reader navigation', async ({ page }) => {
    setupRelationshipTypesMocks(page);

    await page.goto('/settings/relationship-types');

    // Check heading structure
    const heading = page.locator('h2');
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('Relationship Types');

    // Table should have proper structure
    const table = page.locator('table');
    await expect(table).toBeVisible();
    
    // Should have table headers
    await expect(page.locator('th:has-text("Display Name")')).toBeVisible();
    await expect(page.locator('th:has-text("Type Name")')).toBeVisible();
  });

  test('checkboxes should be keyboard accessible', async ({ page }) => {
    setupRelationshipTypesMocks(page);

    await page.goto('/settings/relationship-types');
    await page.click('button:has-text("Add Type")');

    // Tab to directional checkbox
    await page.keyboard.press('Tab'); // type-name
    await page.keyboard.press('Tab'); // display-name
    await page.keyboard.press('Tab'); // description
    await page.keyboard.press('Tab'); // is_directional checkbox

    const directionalCheckbox = page.locator('input[id="is_directional"]');
    await expect(directionalCheckbox).toBeFocused();

    // Press Space to toggle
    await page.keyboard.press('Space');
    await expect(directionalCheckbox).toBeChecked();
  });

  test('should maintain focus management in dialogs', async ({ page }) => {
    setupRelationshipTypesMocks(page);

    await page.goto('/settings/relationship-types');
    await page.click('button:has-text("Add Type")');

    // Dialog should be visible
    await expect(page.locator('text=Create Relationship Type')).toBeVisible();

    // Focus should be on first input
    const typeNameInput = page.locator('input[id="type-name"]');
    await expect(typeNameInput).toBeFocused();

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Dialog should close and focus should return
    await expect(page.locator('text=Create Relationship Type')).not.toBeVisible();
  });
});

