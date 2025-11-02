# Playwright UI Tests for Ticket Relationships System

This directory contains comprehensive Playwright tests for the ticket relationships system UI.

## Test Structure

- `helpers/api-mocks.ts` - API mocking utilities for tests
- `relationship-types.spec.ts` - Tests for relationship type management UI
- `task-relationships.spec.ts` - Tests for task relationships section
- `task-search-autocomplete.spec.ts` - Tests for task search autocomplete component
- `relationship-type-select.spec.ts` - Tests for relationship type select component
- `accessibility.spec.ts` - Accessibility tests
- `visual-regression.spec.ts` - Visual regression tests

## Running Tests

### Install Dependencies

```bash
cd frontend
pnpm install
npx playwright install
```

### Run All Tests

```bash
npm run test
```

### Run Tests in UI Mode

```bash
npm run test:ui
```

### Run Tests in Headed Mode

```bash
npm run test:headed
```

### Run Specific Test File

```bash
npx playwright test relationship-types.spec.ts
```

### Debug Tests

```bash
npm run test:debug
```

## Test Coverage

### Relationship Types Management
- ✅ Display relationship types list
- ✅ Show system type indicators
- ✅ Prevent deletion of system types
- ✅ Create new relationship type
- ✅ Validate required fields
- ✅ Validate type name format
- ✅ Configure directional relationships
- ✅ Validate directional labels
- ✅ Configure blocking relationships
- ✅ Validate blocking statuses
- ✅ Edit existing relationship type
- ✅ Cancel edit dialog
- ✅ Show directional relationship explanation
- ✅ Display blocking status configuration

### Task Relationships Section
- ✅ Display relationships section
- ✅ Show empty state
- ✅ Add relationship
- ✅ Require target task before creating
- ✅ Cancel adding relationship
- ✅ Display directional relationships correctly
- ✅ Display reverse relationships correctly
- ✅ Display blocking indicator
- ✅ Delete relationship
- ✅ Display relationship notes
- ✅ Navigate to related task on click

### Task Search Autocomplete
- ✅ Display search input
- ✅ Show search results after typing
- ✅ Debounce search requests
- ✅ Navigate with keyboard
- ✅ Close dropdown on Escape
- ✅ Exclude current task from results
- ✅ Show loading indicator

### Relationship Type Select
- ✅ Display relationship types in dropdown
- ✅ Show loading state
- ✅ Handle error state
- ✅ Disable when no types available
- ✅ Allow selecting a type
- ✅ Display display_name in dropdown

### Accessibility
- ✅ Keyboard accessibility
- ✅ Proper labels
- ✅ Screen reader support
- ✅ Focus management
- ✅ ARIA attributes

### Visual Regression
- ✅ Relationship types manager snapshot
- ✅ Relationship type edit dialog snapshot
- ✅ Blocking configuration snapshot
- ✅ Task relationships section snapshot
- ✅ Blocked indicator snapshot

## Configuration

Tests are configured in `playwright.config.ts`. The default configuration:

- Runs tests in Chromium, Firefox, and WebKit
- Uses `http://localhost:3000` as base URL
- Automatically starts the dev server before tests
- Retries failed tests on CI
- Generates HTML reports

## API Mocking

Tests use API mocks from `helpers/api-mocks.ts` to avoid dependencies on a running backend. The mocks provide:

- Default relationship types (context, blocked)
- Task relationship CRUD operations
- Task search functionality
- Error handling

## Writing New Tests

When adding new tests:

1. Use the API mock helpers from `helpers/api-mocks.ts`
2. Follow the existing test structure
3. Include accessibility checks
4. Add visual regression tests for UI changes
5. Test both success and error cases
6. Test keyboard navigation

## Continuous Integration

Tests run automatically in CI. Ensure:

- All tests pass before merging
- Visual regression tests are updated for intentional changes
- Accessibility tests remain green

