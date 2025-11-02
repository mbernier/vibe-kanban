import { test, expect } from '@playwright/test';
import {
  setupTaskRelationshipsMocks,
  type MockTask,
} from './helpers/api-mocks';

test.describe('Task Search Autocomplete', () => {
  test('should display search input', async ({ page }) => {
    await page.goto('/');

    // Find search input (assuming it's rendered somewhere)
    const searchInput = page.locator('input[placeholder*="Search tasks"]');
    await expect(searchInput).toBeVisible();
  });

  test('should show search results after typing', async ({ page }) => {
    // Setup API mocks
    page.route('**/api/tasks/search*', (route: any) => {
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
      ];
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTasks),
      });
    });

    await page.goto('/');

    // Find search input
    const searchInput = page.locator('input[placeholder*="Search tasks"]');
    await searchInput.fill('task');

    // Wait for results dropdown
    await expect(page.locator('text=Test Task 2')).toBeVisible();
  });

  test('should debounce search requests', async ({ page }) => {
    let requestCount = 0;

    // Setup API mock that counts requests
    page.route('**/api/tasks/search*', (route: any) => {
      requestCount++;
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
      ];
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTasks),
      });
    });

    await page.goto('/');

    const searchInput = page.locator('input[placeholder*="Search tasks"]');
    
    // Type quickly (should be debounced)
    await searchInput.fill('t');
    await searchInput.fill('ta');
    await searchInput.fill('tas');
    await searchInput.fill('task');

    // Wait for debounce
    await page.waitForTimeout(400);

    // Should have made fewer requests than keystrokes
    expect(requestCount).toBeLessThan(4);
  });

  test('should navigate with keyboard', async ({ page }) => {
    // Setup API mocks
    page.route('**/api/tasks/search*', (route: any) => {
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
      ];
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTasks),
      });
    });

    await page.goto('/');

    const searchInput = page.locator('input[placeholder*="Search tasks"]');
    await searchInput.fill('task');
    
    // Wait for results
    await expect(page.locator('text=Test Task 2')).toBeVisible();

    // Press arrow down
    await searchInput.press('ArrowDown');
    
    // Second item should be highlighted
    const secondItem = page.locator('text=Test Task 3').locator('..');
    await expect(secondItem).toHaveClass(/bg-accent/);

    // Press Enter to select
    await searchInput.press('Enter');

    // Input should be cleared
    await expect(searchInput).toHaveValue('');
  });

  test('should close dropdown on Escape', async ({ page }) => {
    // Setup API mocks
    page.route('**/api/tasks/search*', (route: any) => {
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
      ];
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTasks),
      });
    });

    await page.goto('/');

    const searchInput = page.locator('input[placeholder*="Search tasks"]');
    await searchInput.fill('task');
    
    // Wait for results
    await expect(page.locator('text=Test Task 2')).toBeVisible();

    // Press Escape
    await searchInput.press('Escape');

    // Dropdown should close
    await expect(page.locator('text=Test Task 2')).not.toBeVisible();
  });

  test('should exclude current task from results', async ({ page }) => {
    // Setup API mocks
    page.route('**/api/tasks/search*', (route: any) => {
      const mockTasks: MockTask[] = [
        {
          id: 'task-1', // Current task
          title: 'Current Task',
          description: 'Current task',
          status: 'todo',
          project_id: 'project-1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'task-2',
          title: 'Other Task',
          description: 'Other task',
          status: 'todo',
          project_id: 'project-1',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTasks),
      });
    });

    await page.goto('/');

    const searchInput = page.locator('input[placeholder*="Search tasks"]');
    await searchInput.fill('task');
    
    // Wait for results
    await expect(page.locator('text=Other Task')).toBeVisible();
    
    // Current task should not be in results
    await expect(page.locator('text=Current Task')).not.toBeVisible();
  });

  test('should show loading indicator', async ({ page }) => {
    // Setup API mock with delay
    page.route('**/api/tasks/search*', async (route: any) => {
      await page.waitForTimeout(100);
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
      ];
      
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTasks),
      });
    });

    await page.goto('/');

    const searchInput = page.locator('input[placeholder*="Search tasks"]');
    await searchInput.fill('task');
    
    // Should show loading indicator
    await expect(page.locator('[class*="animate-spin"]')).toBeVisible();
  });
});

