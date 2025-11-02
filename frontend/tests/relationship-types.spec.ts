import { test, expect } from '@playwright/test';

test.describe('Relationship Types Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to settings page (using real backend)
    await page.goto('/settings/relationship-types');
    
    // Wait for the page heading to be visible
    await expect(page.locator('h2')).toContainText('Relationship Types');
  });

  test('should display relationship types list', async ({ page }) => {
    // Check that the page loads
    await expect(page.locator('h2')).toContainText('Relationship Types');

    // Wait for table to appear (may take a moment for API call)
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

    // Check table headers (they're in thead)
    const tableHeaders = page.locator('table thead');
    await expect(tableHeaders.locator('text=Display Name')).toBeVisible();
    await expect(tableHeaders.locator('text=Type Name')).toBeVisible();
    await expect(tableHeaders.locator('text=Directional')).toBeVisible();
    await expect(tableHeaders.locator('text=Blocking')).toBeVisible();

    // Check that at least some relationship types are displayed (system types may have been edited)
    const tableRows = page.locator('table tbody tr');
    await expect(tableRows.first()).toBeVisible();
  });

  test('should show system type indicators', async ({ page }) => {
    // Wait for table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
    
    // Find a system type row (system types have a disabled delete button)
    const systemRow = page.locator('tr').filter({ has: page.locator('button[disabled][title*="Cannot delete"]') }).first();
    await expect(systemRow).toBeVisible();
    
    // System types should have an icon indicator (AlertCircle icon)
    // Look for SVG within the row's first cell (display name cell)
    await expect(systemRow.locator('td').first().locator('svg')).toBeVisible();
  });

  test('should prevent deletion of system types', async ({ page }) => {
    // Wait for table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
    
    // Find a system type row (system types have a disabled delete button)
    const systemRow = page.locator('tr').filter({ has: page.locator('button[disabled][title*="Cannot delete"]') }).first();
    await expect(systemRow).toBeVisible();
    
    // The delete button should be disabled
    const deleteButton = systemRow.locator('button[title*="Cannot delete"]');
    await expect(deleteButton).toBeDisabled();
  });

  test('should allow creating new relationship type', async ({ page }) => {
    // Click "Add Type" button
    await page.click('button:has-text("Add Type")');

    // Fill in the form with unique name
    const uniqueId = `related-${Date.now()}`;
    await page.fill('input[id="type-name"]', uniqueId);
    await page.fill('input[id="display-name"]', 'Related Tasks');

    // Save and wait for dialog to close
    await page.getByRole('button', { name: 'Create' }).click();
    
    // Wait for dialog to close (it will close on successful save)
    await expect(page.locator('text=Create Relationship Type')).not.toBeVisible({ timeout: 5000 });
    
    // Verify the type was created (check in table)
    await expect(page.locator('table').locator('text=Related Tasks').first()).toBeVisible({ timeout: 5000 });
  });

  test('should validate required fields when creating type', async ({ page }) => {
    // Click "Add Type" button
    await page.click('button:has-text("Add Type")');

    // Try to save without filling required fields
    await page.click('button:has-text("Create")');

    // Should show validation errors
    await expect(page.locator('text=Type name is required')).toBeVisible();
  });

  test('should validate type name format', async ({ page }) => {
    // Click "Add Type" button
    await page.click('button:has-text("Add Type")');

    // Enter type name with spaces (invalid)
    await page.fill('input[id="type-name"]', 'invalid name');

    // Should show error
    await expect(page.locator('text=Type name cannot contain spaces')).toBeVisible();
  });

  test('should configure directional relationship', async ({ page }) => {
    // Click "Add Type" button
    await page.click('button:has-text("Add Type")');

    // Wait for dialog to appear
    await expect(page.locator('text=Create Relationship Type')).toBeVisible();

    // Fill basic info with unique name
    const uniqueId = `depends-${Date.now()}`;
    await page.fill('input[id="type-name"]', uniqueId);
    await page.fill('input[id="display-name"]', 'Depends On');

    // Check "Is Directional" checkbox (click the label since it's a custom checkbox component)
    await page.getByRole('checkbox', { name: 'Is Directional' }).click();

    // Should show directional configuration section
    await expect(page.locator('text=How Directional Relationships Work')).toBeVisible();

    // Fill forward and reverse labels
    await page.fill('input[id="forward-label"]', 'depends on');
    await page.fill('input[id="reverse-label"]', 'required by');

    // Save and wait for dialog to close
    await page.getByRole('button', { name: 'Create' }).click();
    
    // Wait for dialog to close (it will close on successful save)
    await expect(page.locator('text=Create Relationship Type')).not.toBeVisible({ timeout: 5000 });
    
    // Verify the type was created (check in table)
    await expect(page.locator('table').locator('text=Depends On').first()).toBeVisible({ timeout: 5000 });
  });

  test('should validate directional labels are required', async ({ page }) => {
    // Click "Add Type" button
    await page.click('button:has-text("Add Type")');

    // Wait for dialog to appear
    await expect(page.locator('text=Create Relationship Type')).toBeVisible();

    // Fill basic info with unique name
    const uniqueId = `depends-${Date.now()}`;
    await page.fill('input[id="type-name"]', uniqueId);
    await page.fill('input[id="display-name"]', 'Depends On');

    // Check "Is Directional" checkbox (click the label since it's a custom checkbox component)
    await page.getByRole('checkbox', { name: 'Is Directional' }).click();

    // Try to save without labels
    await page.click('button:has-text("Create")');

    // Should show validation error
    await expect(
      page.locator('text=Both forward and reverse labels are required for directional relationships')
    ).toBeVisible();
  });

  test('should configure blocking relationship', async ({ page }) => {
    // Click "Add Type" button
    await page.click('button:has-text("Add Type")');

    // Wait for dialog to appear
    await expect(page.locator('text=Create Relationship Type')).toBeVisible();

    // Fill basic info with unique name
    const uniqueId = `blocks-${Date.now()}`;
    await page.fill('input[id="type-name"]', uniqueId);
    await page.fill('input[id="display-name"]', 'Blocks');

    // Check "Enforces Blocking Rules" checkbox (click the label since it's a custom checkbox component)
    await page.getByRole('checkbox', { name: 'Enforces Blocking Rules' }).click();

    // Wait for blocking configuration section to appear
    await expect(page.locator('text=Blocked Statuses').first()).toBeVisible({ timeout: 2000 });

    // Select some statuses (use getByRole with label text for custom checkboxes)
    await page.getByRole('checkbox', { name: 'todo' }).first().click();
    await page.getByRole('checkbox', { name: 'done' }).first().click();
    // For source statuses, need to find them in the second section
    const sourceSection = page.locator('text=Blocking Source Statuses').locator('..');
    await sourceSection.getByRole('checkbox', { name: 'todo' }).click();
    await sourceSection.getByRole('checkbox', { name: 'inprogress' }).click();

    // Save and wait for dialog to close
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.locator('text=Create Relationship Type')).not.toBeVisible({ timeout: 5000 });
    
    // Verify the type was created (check in table)
    await expect(page.locator('table').locator('text=Blocks').first()).toBeVisible({ timeout: 5000 });
  });

  test('should validate blocking statuses are configured', async ({ page }) => {
    // Click "Add Type" button
    await page.click('button:has-text("Add Type")');

    // Wait for dialog to appear
    await expect(page.locator('text=Create Relationship Type')).toBeVisible();

    // Fill basic info with unique name
    const uniqueId = `blocks-${Date.now()}`;
    await page.fill('input[id="type-name"]', uniqueId);
    await page.fill('input[id="display-name"]', 'Blocks');

    // Check "Enforces Blocking Rules" checkbox (click the label since it's a custom checkbox component)
    await page.getByRole('checkbox', { name: 'Enforces Blocking Rules' }).click();

    // Wait for blocking configuration section to appear
    await expect(page.locator('text=Blocked Statuses').first()).toBeVisible({ timeout: 2000 });

    // Clear all default selected statuses (component has defaults, so we need to uncheck them)
    const blockedSection = page.locator('text=Blocked Statuses').locator('..');
    const sourceSection = page.locator('text=Blocking Source Statuses').locator('..');
    
    // Uncheck all blocked statuses (defaults are: todo, inreview, done, cancelled)
    await blockedSection.getByRole('checkbox', { name: 'todo' }).click();
    await blockedSection.getByRole('checkbox', { name: 'inreview' }).click();
    await blockedSection.getByRole('checkbox', { name: 'done' }).click();
    await blockedSection.getByRole('checkbox', { name: 'cancelled' }).click();
    
    // Uncheck all source statuses (defaults are: todo, inprogress, inreview)
    await sourceSection.getByRole('checkbox', { name: 'todo' }).click();
    await sourceSection.getByRole('checkbox', { name: 'inprogress' }).click();
    await sourceSection.getByRole('checkbox', { name: 'inreview' }).click();

    // Try to save without selecting statuses
    await page.getByRole('button', { name: 'Create' }).click();

    // Wait a moment for validation to run
    await page.waitForTimeout(500);

    // Should show validation error (error is displayed in an Alert component)
    await expect(
      page.locator('text=Blocking statuses must be configured when blocking is enabled')
    ).toBeVisible({ timeout: 5000 });
  });

  test('should edit existing relationship type', async ({ page }) => {
    // Wait for table to load
    await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
    
    // Find a row that can be edited (non-system type) or use first available row
    const firstRow = page.locator('table tbody tr').first();
    await expect(firstRow).toBeVisible();
    
    // Click edit button
    await firstRow.locator('button[title*="Edit"]').click();

    // Wait for edit dialog
    await expect(page.locator('text=Edit Relationship Type')).toBeVisible();

    // Update display name with unique value
    const updatedName = `Updated Display Name ${Date.now()}`;
    await page.fill('input[id="display-name"]', updatedName);

    // Save
    await page.click('button:has-text("Update")');

    // Wait for dialog to close
    await expect(page.locator('text=Edit Relationship Type')).not.toBeVisible({ timeout: 5000 });

    // Verify update
    await expect(page.locator(`text=${updatedName}`)).toBeVisible({ timeout: 5000 });
  });

  test('should cancel edit dialog', async ({ page }) => {
    // Click "Add Type" button
    await page.click('button:has-text("Add Type")');

    // Fill some data
    await page.fill('input[id="type-name"]', 'test');

    // Click cancel
    await page.click('button:has-text("Cancel")');

    // Dialog should close
    await expect(page.locator('text=Create Relationship Type')).not.toBeVisible();
  });

  test('should show directional relationship explanation', async ({ page }) => {
    // Click "Add Type" button
    await page.click('button:has-text("Add Type")');

    // Wait for dialog to appear
    await expect(page.locator('text=Create Relationship Type')).toBeVisible();

    // Check "Is Directional" checkbox (click the label since it's a custom checkbox component)
    await page.getByRole('checkbox', { name: 'Is Directional' }).click();

    // Should show explanation card
    await expect(page.locator('text=How Directional Relationships Work')).toBeVisible();
    await expect(page.locator('text=When Task A is related to Task B:')).toBeVisible();
    await expect(page.locator('text=Forward: Task A')).toBeVisible();
    await expect(page.locator('text=Reverse: Task B')).toBeVisible();
  });

  test('should display blocking status configuration', async ({ page }) => {
    // Click "Add Type" button
    await page.click('button:has-text("Add Type")');

    // Wait for dialog to appear
    await expect(page.locator('text=Create Relationship Type')).toBeVisible();

    // Fill basic info with unique name
    const uniqueId = `blocks-${Date.now()}`;
    await page.fill('input[id="type-name"]', uniqueId);
    await page.fill('input[id="display-name"]', 'Blocks');

    // Check "Enforces Blocking Rules" checkbox (click the label since it's a custom checkbox component)
    await page.getByRole('checkbox', { name: 'Enforces Blocking Rules' }).click();

    // Wait for blocking configuration section to appear
    await expect(page.locator('text=Blocked Statuses').first()).toBeVisible({ timeout: 2000 });
    
    // Should show all status checkboxes (use getByRole with label text)
    const blockedSection = page.locator('text=Blocked Statuses').locator('..');
    const sourceSection = page.locator('text=Blocking Source Statuses').locator('..');
    const statuses = ['todo', 'inprogress', 'inreview', 'done', 'cancelled'];
    for (const status of statuses) {
      await expect(blockedSection.getByRole('checkbox', { name: status })).toBeVisible({ timeout: 2000 });
      await expect(sourceSection.getByRole('checkbox', { name: status })).toBeVisible({ timeout: 2000 });
    }

    // Should show help text
    await expect(
      page.locator('text=Statuses that cannot be set if task is blocked')
    ).toBeVisible();
    await expect(
      page.locator('text=Statuses that cause blocking when source task')
    ).toBeVisible();
  });
});

