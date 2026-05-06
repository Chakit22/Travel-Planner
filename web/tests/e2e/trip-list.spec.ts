import { test, expect } from '@playwright/test';

const MOCK_USER_ID = 'e2e-user-trip-list';

const MOCK_TRIPS = [
  {
    id: 'trip-001',
    userId: MOCK_USER_ID,
    destination: 'Tokyo',
    origin: 'Melbourne',
    departureDate: '2026-05-01',
    returnDate: '2026-05-05',
    travelers: 2,
    status: 'draft',
    itinerary: null,
    itineraryVersion: 1,
    suggestions: [],
    createdAt: '2026-03-20T00:00:00Z',
    updatedAt: '2026-03-20T00:00:00Z',
  },
  {
    id: 'trip-002',
    userId: MOCK_USER_ID,
    destination: 'Paris',
    origin: 'Melbourne',
    departureDate: '2026-06-10',
    returnDate: '2026-06-15',
    travelers: 1,
    status: 'approved',
    itinerary: '# Day 1\nVisit the Eiffel Tower.',
    itineraryVersion: 2,
    suggestions: [
      { type: 'weather', reason: 'Rain added', newItinerary: 'Updated...', createdAt: '2026-03-25' },
    ],
    createdAt: '2026-03-22T00:00:00Z',
    updatedAt: '2026-03-22T00:00:00Z',
  },
];

test.describe('Trip List Journey', () => {
  test.beforeEach(async ({ page }) => {
    // Set up route mocks BEFORE navigating
    await page.route('**/api/trips?user_id=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_TRIPS),
      });
    });

    // Navigate to set localStorage, then reload with mocks active
    await page.goto('/');
    await page.evaluate((uid) => localStorage.setItem('atlas_user_id', uid), MOCK_USER_ID);
  });

  test('TC-E2E-007: returning user sees trip list', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('h1')).toContainText('Your Trips');
    await expect(page.locator('text=2 trips')).toBeVisible();
  });

  test('TC-E2E-008: trip cards show destination, status, dates', async ({ page }) => {
    await page.goto('/');

    // Tokyo card
    await expect(page.locator('text=Tokyo')).toBeVisible();
    await expect(page.locator('text=draft')).toBeVisible();
    await expect(page.locator('text=2 travelers')).toBeVisible();

    // Paris card
    await expect(page.locator('text=Paris')).toBeVisible();
    await expect(page.locator('text=approved')).toBeVisible();
    await expect(page.locator('text=1 traveler')).toBeVisible();
  });

  test('TC-E2E-009: approved trip shows itinerary version', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Itinerary v2')).toBeVisible();
  });

  test('TC-E2E-010: trip with suggestions shows badge count', async ({ page }) => {
    await page.goto('/');
    // The suggestion count badge showing "1"
    const badge = page.locator('.bg-amber.rounded-full');
    await expect(badge).toBeVisible();
  });

  test('TC-E2E-011: clicking trip card navigates to trip page', async ({ page }) => {
    // Also mock the trip detail endpoint
    await page.route('**/api/trips/trip-001', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_TRIPS[0]),
        });
      }
    });

    await page.goto('/');
    await page.locator('a[href="/trip/trip-001"]').click();

    await expect(page).toHaveURL('/trip/trip-001');
  });

  test('TC-E2E-012: New Trip button creates trip and navigates', async ({ page }) => {
    const newTrip = {
      id: 'trip-new',
      userId: MOCK_USER_ID,
      destination: null,
      origin: null,
      departureDate: null,
      returnDate: null,
      travelers: null,
      status: 'draft',
      itinerary: null,
      itineraryVersion: 1,
      suggestions: [],
      createdAt: '2026-03-25T00:00:00Z',
      updatedAt: '2026-03-25T00:00:00Z',
    };

    await page.route('**/api/trips', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(newTrip),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/trips/trip-new', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(newTrip),
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'New Trip' }).click();

    await expect(page).toHaveURL('/trip/trip-new', { timeout: 5000 });
  });

  test('TC-E2E-013: empty trip list shows empty state', async ({ page }) => {
    await page.route('**/api/trips?user_id=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');

    await expect(page.locator('text=Where to next?')).toBeVisible();
    await expect(page.locator('text=No trips yet')).toBeVisible();
  });
});
