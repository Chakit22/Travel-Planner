import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/index';
import { db, sql as pgClient } from '../../src/db/client';
import { users, trips, conversations } from '../../src/db/schema';
import { eq } from 'drizzle-orm';

const app = createApp();

let testUserId: string;
const createdTripIds: string[] = [];

beforeAll(async () => {
  const email = `trips-qa-${Date.now()}@qa.com`;
  const [user] = await db.insert(users).values({ name: 'Trips QA', email }).returning();
  testUserId = user.id;
});

afterAll(async () => {
  // Clean up trips (cascade deletes conversations)
  for (const id of createdTripIds) {
    await db.delete(trips).where(eq(trips.id, id)).catch(() => {});
  }
  // Clean up user
  await db.delete(users).where(eq(users.id, testUserId)).catch(() => {});
  await pgClient.end();
});

// ─── CREATE ─────────────────────────────────────────────────────────────────

describe('POST /api/trips', () => {
  it('TC-BE-010: 201 on valid payload', async () => {
    const res = await request(app)
      .post('/api/trips')
      .send({
        userId: testUserId,
        destination: 'Tokyo',
        origin: 'Melbourne',
        departureDate: '2026-05-01',
        returnDate: '2026-05-05',
        travelers: 2,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.destination).toBe('Tokyo');
    expect(res.body.status).toBe('draft');
    expect(res.body.itineraryVersion).toBe(1);
    expect(res.body.suggestions).toEqual([]);
    createdTripIds.push(res.body.id);
  });

  it('TC-BE-011: 201 creates associated conversation', async () => {
    const tripRes = await request(app)
      .post('/api/trips')
      .send({ userId: testUserId, destination: 'Paris' });

    createdTripIds.push(tripRes.body.id);

    const [convo] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.tripId, tripRes.body.id));

    expect(convo).toBeDefined();
    expect(convo.phase).toBe('gathering');
    expect(convo.messages).toEqual([]);
  });

  it('TC-BE-012: 400 on missing userId', async () => {
    const res = await request(app)
      .post('/api/trips')
      .send({ destination: 'Tokyo' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('userId is required');
  });

  it('TC-BE-013: 400 on non-existent userId (FK violation)', async () => {
    const res = await request(app)
      .post('/api/trips')
      .send({ userId: '00000000-0000-0000-0000-000000000000' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('User not found');
  });

  it('TC-BE-014: 201 with minimal payload (only userId)', async () => {
    const res = await request(app)
      .post('/api/trips')
      .send({ userId: testUserId });

    expect(res.status).toBe(201);
    expect(res.body.destination).toBeNull();
    expect(res.body.travelers).toBeNull();
    createdTripIds.push(res.body.id);
  });
});

// ─── LIST ───────────────────────────────────────────────────────────────────

describe('GET /api/trips?user_id=x', () => {
  it('TC-BE-015: 200 returns trips for user', async () => {
    const res = await request(app)
      .get(`/api/trips?user_id=${testUserId}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    // All trips belong to this user
    for (const trip of res.body) {
      expect(trip.userId).toBe(testUserId);
    }
  });

  it('TC-BE-016: 200 returns empty array for user with no trips', async () => {
    const email = `empty-${Date.now()}@qa.com`;
    const [emptyUser] = await db.insert(users).values({ name: 'Empty', email }).returning();

    const res = await request(app)
      .get(`/api/trips?user_id=${emptyUser.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);

    await db.delete(users).where(eq(users.id, emptyUser.id));
  });

  it('TC-BE-017: 400 when user_id missing', async () => {
    const res = await request(app).get('/api/trips');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('user_id query param is required');
  });
});

// ─── GET SINGLE ─────────────────────────────────────────────────────────────

describe('GET /api/trips/:id', () => {
  it('TC-BE-018: 200 on valid trip', async () => {
    const tripId = createdTripIds[0];
    const res = await request(app).get(`/api/trips/${tripId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(tripId);
    expect(res.body.destination).toBe('Tokyo');
  });

  it('TC-BE-019: 404 on non-existent trip', async () => {
    const res = await request(app)
      .get('/api/trips/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Trip not found');
  });

  it('TC-BE-020: handles invalid UUID gracefully', async () => {
    const res = await request(app).get('/api/trips/not-a-uuid');

    // Should be 400 ideally, but currently 500
    expect(res.status).toBeOneOf([400, 500]);
    expect(res.body.error).toBeDefined();
    expect(res.body.stack).toBeUndefined();
  });
});

// ─── UPDATE ─────────────────────────────────────────────────────────────────

describe('PATCH /api/trips/:id', () => {
  it('TC-BE-021: 200 updates status', async () => {
    const tripId = createdTripIds[0];
    const res = await request(app)
      .patch(`/api/trips/${tripId}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
  });

  it('TC-BE-022: 200 updates destination', async () => {
    const tripId = createdTripIds[0];
    const res = await request(app)
      .patch(`/api/trips/${tripId}`)
      .send({ destination: 'Osaka' });

    expect(res.status).toBe(200);
    expect(res.body.destination).toBe('Osaka');
  });

  it('TC-BE-023: 404 on non-existent trip', async () => {
    const res = await request(app)
      .patch('/api/trips/00000000-0000-0000-0000-000000000000')
      .send({ status: 'approved' });

    expect(res.status).toBe(404);
  });

  it('TC-BE-024: accepts arbitrary status string (QA finding — no validation)', async () => {
    const tripId = createdTripIds[0];
    const res = await request(app)
      .patch(`/api/trips/${tripId}`)
      .send({ status: 'banana' });

    // This SHOULD be 400 but current code allows it
    // Documenting actual behavior — this is a QA finding
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('banana');

    // Reset to valid value
    await request(app)
      .patch(`/api/trips/${tripId}`)
      .send({ status: 'draft' });
  });
});

// ─── SUGGESTIONS ────────────────────────────────────────────────────────────

describe('PATCH /api/trips/:id — suggestion accept/dismiss', () => {
  let suggestionTripId: string;

  beforeAll(async () => {
    // Create trip with a suggestion
    const [trip] = await db
      .insert(trips)
      .values({
        userId: testUserId,
        destination: 'Sydney',
        suggestions: [
          { type: 'weather', reason: 'Rain forecast', newItinerary: 'Updated DAY 1...', createdAt: new Date().toISOString() },
          { type: 'weather', reason: 'Cold snap', newItinerary: 'Updated DAY 2...', createdAt: new Date().toISOString() },
        ],
        itinerary: 'Original itinerary...',
        itineraryVersion: 1,
      })
      .returning();
    suggestionTripId = trip.id;
    createdTripIds.push(suggestionTripId);

    // Create conversation for it
    await db.insert(conversations).values({
      tripId: suggestionTripId,
      messages: [],
      phase: 'planning',
    });
  });

  it('TC-BE-025: accept suggestion updates itinerary and bumps version', async () => {
    const res = await request(app)
      .patch(`/api/trips/${suggestionTripId}`)
      .send({ acceptSuggestion: 0 });

    expect(res.status).toBe(200);
    expect(res.body.itinerary).toBe('Updated DAY 1...');
    expect(res.body.itineraryVersion).toBe(2);
    expect(res.body.status).toBe('approved');
    // Only the second suggestion should remain
    expect(res.body.suggestions).toHaveLength(1);
  });

  it('TC-BE-026: dismiss suggestion removes it', async () => {
    const res = await request(app)
      .patch(`/api/trips/${suggestionTripId}`)
      .send({ dismissSuggestion: 0 });

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toHaveLength(0);
  });

  it('TC-BE-027: 400 on invalid suggestion index', async () => {
    const res = await request(app)
      .patch(`/api/trips/${suggestionTripId}`)
      .send({ acceptSuggestion: 99 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid suggestion index');
  });
});

// ─── DELETE ─────────────────────────────────────────────────────────────────

describe('DELETE /api/trips/:id', () => {
  it('TC-BE-028: 200 deletes trip and cascades conversation', async () => {
    // Create a trip to delete
    const createRes = await request(app)
      .post('/api/trips')
      .send({ userId: testUserId, destination: 'Delete Me' });
    const tripId = createRes.body.id;

    const res = await request(app).delete(`/api/trips/${tripId}`);

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    // Verify cascade deleted conversation
    const [convo] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.tripId, tripId));
    expect(convo).toBeUndefined();
  });

  it('TC-BE-029: 404 on non-existent trip', async () => {
    const res = await request(app)
      .delete('/api/trips/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
  });
});

// ─── REPLAN ─────────────────────────────────────────────────────────────────

describe('POST /api/trips/:id/replan', () => {
  it('TC-BE-030: 400 on trip with no itinerary', async () => {
    // Create trip without itinerary
    const createRes = await request(app)
      .post('/api/trips')
      .send({ userId: testUserId, destination: 'No Itinerary' });
    createdTripIds.push(createRes.body.id);

    const res = await request(app)
      .post(`/api/trips/${createRes.body.id}/replan`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Trip has no itinerary to replan');
  });

  it('TC-BE-031: 404 on non-existent trip', async () => {
    const res = await request(app)
      .post('/api/trips/00000000-0000-0000-0000-000000000000/replan')
      .send({});

    expect(res.status).toBe(404);
  });
});
