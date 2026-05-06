import { test, expect } from '@playwright/test';

const MOCK_USER_ID = 'e2e-user-detail';

const MOCK_TRIP = {
  id: 'trip-detail-001',
  userId: MOCK_USER_ID,
  destination: 'Tokyo',
  origin: 'Melbourne',
  departureDate: '2026-05-01',
  returnDate: '2026-05-05',
  travelers: 2,
  status: 'draft',
  itinerary: null as string | null,
  itineraryVersion: 1,
  suggestions: [] as any[],
  createdAt: '2026-03-20T00:00:00Z',
  updatedAt: '2026-03-20T00:00:00Z',
};

function sseResponse(events: Array<{ event: string; data: any }>) {
  return events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');
}

test.describe('Trip Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate((uid) => localStorage.setItem('atlas_user_id', uid), MOCK_USER_ID);
  });

  test('TC-E2E-014: trip page shows header with destination and status', async ({ page }) => {
    await page.route(`**/api/trips/${MOCK_TRIP.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_TRIP),
      });
    });

    await page.goto(`/trip/${MOCK_TRIP.id}`);

    await expect(page.locator('h1')).toContainText('Tokyo');
    await expect(page.locator('text=draft')).toBeVisible();
    await expect(page.locator('text=Phase: gathering')).toBeVisible();
  });

  test('TC-E2E-015: empty itinerary shows placeholder', async ({ page }) => {
    await page.route(`**/api/trips/${MOCK_TRIP.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_TRIP),
      });
    });

    await page.goto(`/trip/${MOCK_TRIP.id}`);

    await expect(page.locator('text=No itinerary yet')).toBeVisible();
  });

  test('TC-E2E-016: chat input sends user message and clears input', async ({ page }) => {
    await page.route(`**/api/trips/${MOCK_TRIP.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_TRIP),
      });
    });

    await page.goto(`/trip/${MOCK_TRIP.id}`);

    // Type and send
    const input = page.locator('textarea');
    await input.fill('I want to go to Tokyo');
    await page.getByRole('button', { name: 'Send' }).click();

    // User message bubble should appear in chat
    await expect(page.locator('text=I want to go to Tokyo')).toBeVisible();

    // Input should be cleared after send
    await expect(input).toHaveValue('');

    // Note: SSE agent response rendering cannot be E2E tested without a real
    // backend server running. The SSE streaming path is covered by the unit
    // test for streamChat in tests/lib/api.test.ts and the ChatPanel component
    // test in tests/components/ChatPanel.test.tsx.
  });

  test('TC-E2E-017: send button disabled when input empty', async ({ page }) => {
    await page.route(`**/api/trips/${MOCK_TRIP.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_TRIP),
      });
    });

    await page.goto(`/trip/${MOCK_TRIP.id}`);

    const sendBtn = page.getByRole('button', { name: 'Send' });
    await expect(sendBtn).toBeDisabled();

    await page.locator('textarea').fill('Hello');
    await expect(sendBtn).toBeEnabled();
  });

  test('TC-E2E-018: trip with itinerary shows rendered content', async ({ page }) => {
    const tripWithItinerary = {
      ...MOCK_TRIP,
      itinerary: '# Day 1\n\nVisit Senso-ji Temple.\n\n# Day 2\n\nExplore Shibuya.',
      itineraryVersion: 2,
      status: 'draft',
    };

    await page.route(`**/api/trips/${MOCK_TRIP.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(tripWithItinerary),
      });
    });

    await page.goto(`/trip/${MOCK_TRIP.id}`);

    await expect(page.locator('text=Your Itinerary')).toBeVisible();
    await expect(page.locator('text=v2')).toBeVisible();
    await expect(page.locator('text=Day 1')).toBeVisible();
    await expect(page.locator('text=Visit Senso-ji Temple.')).toBeVisible();
  });

  test('TC-E2E-019: approve button visible on draft trip with itinerary', async ({ page }) => {
    const tripWithItinerary = {
      ...MOCK_TRIP,
      itinerary: '# Day 1\n\nStuff to do.',
      status: 'draft',
    };

    await page.route(`**/api/trips/${MOCK_TRIP.id}`, async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...tripWithItinerary, status: 'approved' }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(tripWithItinerary),
        });
      }
    });

    await page.goto(`/trip/${MOCK_TRIP.id}`);

    const approveBtn = page.getByRole('button', { name: 'Approve' });
    await expect(approveBtn).toBeVisible();

    await approveBtn.click();

    // Status should update to approved
    await expect(page.locator('text=approved')).toBeVisible({ timeout: 5000 });
  });

  test('TC-E2E-020: suggestion banner shows with accept/dismiss', async ({ page }) => {
    const tripWithSuggestion = {
      ...MOCK_TRIP,
      itinerary: '# Day 1\n\nOriginal plan.',
      status: 'approved',
      suggestions: [
        {
          type: 'weather',
          reason: 'Rain forecast added for May 2',
          newItinerary: '# Day 1\n\nUpdated: indoor museum visit.',
          createdAt: '2026-03-25T00:00:00Z',
        },
      ],
    };

    await page.route(`**/api/trips/${MOCK_TRIP.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(tripWithSuggestion),
      });
    });

    await page.goto(`/trip/${MOCK_TRIP.id}`);

    await expect(page.locator('text=Weather changed for your trip')).toBeVisible();
    await expect(page.locator('text=Rain forecast added for May 2')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dismiss' })).toBeVisible();
  });

  test('TC-E2E-021: suggestion preview toggle works', async ({ page }) => {
    const tripWithSuggestion = {
      ...MOCK_TRIP,
      itinerary: '# Original',
      status: 'approved',
      suggestions: [
        {
          type: 'weather',
          reason: 'Cold snap',
          newItinerary: 'UPDATED_CONTENT_FOR_TEST',
          createdAt: '2026-03-25T00:00:00Z',
        },
      ],
    };

    await page.route(`**/api/trips/${MOCK_TRIP.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(tripWithSuggestion),
      });
    });

    await page.goto(`/trip/${MOCK_TRIP.id}`);

    // Preview should not be visible initially
    await expect(page.locator('text=UPDATED_CONTENT_FOR_TEST')).not.toBeVisible();

    // Click preview toggle
    await page.getByRole('button', { name: 'Preview changes' }).click();
    await expect(page.locator('text=UPDATED_CONTENT_FOR_TEST')).toBeVisible();

    // Toggle off
    await page.getByRole('button', { name: 'Hide preview' }).click();
    await expect(page.locator('text=UPDATED_CONTENT_FOR_TEST')).not.toBeVisible();
  });

  test('TC-E2E-022: delete button prompts confirm and navigates home', async ({ page }) => {
    await page.route(`**/api/trips/${MOCK_TRIP.id}`, async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ deleted: true }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(MOCK_TRIP),
        });
      }
    });

    // Mock trips list for redirect
    await page.route('**/api/trips?user_id=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto(`/trip/${MOCK_TRIP.id}`);

    // Handle confirm dialog
    page.on('dialog', (dialog) => dialog.accept());

    await page.getByRole('button', { name: 'Delete' }).click();

    await expect(page).toHaveURL('/', { timeout: 5000 });
  });

  test('TC-E2E-023: back arrow navigates to trip list', async ({ page }) => {
    await page.route(`**/api/trips/${MOCK_TRIP.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_TRIP),
      });
    });

    await page.route('**/api/trips?user_id=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto(`/trip/${MOCK_TRIP.id}`);

    // Click back arrow (← character)
    await page.locator('button:has-text("←")').click();

    await expect(page).toHaveURL('/', { timeout: 5000 });
  });
});
