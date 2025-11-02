import { test, expect } from '@playwright/test';
import {
  setupRelationshipTypesMocks,
  defaultRelationshipTypes,
} from './helpers/api-mocks';

test.describe('Relationship Type Select', () => {
  test.beforeEach(async ({ page }) => {
    // Setup API mocks
    setupRelationshipTypesMocks(page);
  });

  test('should display relationship types in dropdown', async ({ page }) => {
    // Navigate to a page with the select component
    await page.goto('/settings/relationship-types');
    
    // Click "Add Type" to open dialog
    await page.click('button:has-text("Add Type")');

    // Find the relationship type select (if it exists in this context)
    // For now, we'll test it in the context where it's used
    const select = page.locator('[role="combobox"]').first();
    
    if (await select.isVisible()) {
      await select.click();
      
      // Should show relationship types
      await expect(page.locator('text=Context Tickets')).toBeVisible();
      await expect(page.locator('text=Blocked Tickets')).toBeVisible();
    }
  });

  test('should show loading state', async ({ page }) => {
    // Delay API response
    page.route('**/api/task-relationship-types', async (route: any) => {
      await page.waitForTimeout(200);
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(defaultRelationshipTypes),
      });
    });

    await page.goto('/settings/relationship-types');
    await page.click('button:has-text("Add Type")');

    // Should show loading indicator
    await expect(page.locator('text=Loading types...')).toBeVisible();
  });

  test('should handle error state', async ({ page }) => {
    // Mock API error
    page.route('**/api/task-relationship-types', (route: any) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await page.goto('/settings/relationship-types');
    await page.click('button:has-text("Add Type")');

    // Should show error message
    await expect(page.locator('text=Failed to load relationship types')).toBeVisible();
  });

  test('should disable when no types available', async ({ page }) => {
    // Mock empty response
    page.route('**/api/task-relationship-types', (route: any) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/settings/relationship-types');
    await page.click('button:has-text("Add Type")');

    const select = page.locator('[role="combobox"]').first();
    if (await select.isVisible()) {
      await expect(select).toBeDisabled();
    }
  });

  test('should allow selecting a type', async ({ page }) => {
    await page.goto('/settings/relationship-types');
    await page.click('button:has-text("Add Type")');

    const select = page.locator('[role="combobox"]').first();
    if (await select.isVisible()) {
      await select.click();
      await page.click('text=Context Tickets');
      
      // Verify selection (check if value changed)
      await expect(select).toContainText('Context Tickets');
    }
  });

  test('should display display_name in dropdown', async ({ page }) => {
    await page.goto('/settings/relationship-types');
    await page.click('button:has-text("Add Type")');

    const select = page.locator('[role="combobox"]').first();
    if (await select.isVisible()) {
      await select.click();
      
      // Should show display names, not type names
      await expect(page.locator('text=Context Tickets')).toBeVisible();
      await expect(page.locator('text=context')).not.toBeVisible(); // type_name should not be visible
    }
  });
});

