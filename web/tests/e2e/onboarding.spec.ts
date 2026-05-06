import { test, expect } from '@playwright/test';

// Mock user data
const MOCK_USER = {
  id: 'e2e-user-001',
  name: 'E2E Tester',
  email: 'e2e@test.com',
  createdAt: '2026-03-25T00:00:00Z',
};

test.describe('Onboarding Journey', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage so onboarding shows
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('TC-E2E-001: new user sees onboarding form', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('h1')).toContainText('Welcome to Atlas');
    await expect(page.locator('text=Your AI travel planner')).toBeVisible();
    await expect(page.locator('#name')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();
  });

  test('TC-E2E-002: validation shows error on empty submit', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Get Started' }).click();

    await expect(page.locator('text=Name and email are required')).toBeVisible();
  });

  test('TC-E2E-003: validation shows error on name-only submit', async ({ page }) => {
    await page.goto('/');

    await page.fill('#name', 'Test User');
    await page.getByRole('button', { name: 'Get Started' }).click();

    await expect(page.locator('text=Name and email are required')).toBeVisible();
  });

  test('TC-E2E-004: successful onboarding creates user and shows trip list', async ({ page }) => {
    // Mock the API calls
    await page.route('**/api/users', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_USER),
        });
      }
    });

    await page.route('**/api/trips?user_id=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');

    await page.fill('#name', 'E2E Tester');
    await page.fill('#email', 'e2e@test.com');
    await page.getByRole('button', { name: 'Get Started' }).click();

    // Should transition to trip list
    await expect(page.locator('h1')).toContainText('Your Trips', { timeout: 5000 });
    await expect(page.locator('text=No trips yet')).toBeVisible();
    await expect(page.locator('text=Where to next?')).toBeVisible();
  });

  test('TC-E2E-005: API error on user creation shows error message', async ({ page }) => {
    await page.route('**/api/users', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Email already exists' }),
      });
    });

    await page.goto('/');

    await page.fill('#name', 'Test');
    await page.fill('#email', 'existing@test.com');
    await page.getByRole('button', { name: 'Get Started' }).click();

    await expect(page.locator('text=Email already exists')).toBeVisible({ timeout: 5000 });
  });

  test('TC-E2E-006: button shows loading state during creation', async ({ page }) => {
    // Slow the API response to catch loading state
    await page.route('**/api/users', async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_USER),
      });
    });

    await page.route('**/api/trips?user_id=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');

    await page.fill('#name', 'Test');
    await page.fill('#email', 'test@test.com');
    await page.getByRole('button', { name: 'Get Started' }).click();

    // Button should show loading text
    await expect(page.getByRole('button', { name: 'Creating...' })).toBeVisible();
  });
});
