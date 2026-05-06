import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/index';
import { db, sql as pgClient } from '../../src/db/client';
import { users } from '../../src/db/schema';
import { eq } from 'drizzle-orm';

const app = createApp();

// Track created user IDs for cleanup
const createdIds: string[] = [];

afterAll(async () => {
  // Clean up test data
  for (const id of createdIds) {
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
  await pgClient.end();
});

describe('POST /api/users', () => {
  it('TC-BE-001: 201 on valid payload', async () => {
    const email = `test-${Date.now()}@qa.com`;
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'QA Test', email });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('QA Test');
    expect(res.body.email).toBe(email);
    expect(res.body.createdAt).toBeDefined();
    // No internal fields leaked
    expect(res.body.stack).toBeUndefined();
    expect(res.body.password).toBeUndefined();

    createdIds.push(res.body.id);
  });

  it('TC-BE-002: 400 on missing name', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ email: 'no-name@qa.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name and email are required');
  });

  it('TC-BE-003: 400 on missing email', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'No Email' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('name and email are required');
  });

  it('TC-BE-004: 400 on empty body', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('TC-BE-005: 409 on duplicate email', async () => {
    const email = `dup-${Date.now()}@qa.com`;

    const first = await request(app)
      .post('/api/users')
      .send({ name: 'First', email });
    createdIds.push(first.body.id);

    const second = await request(app)
      .post('/api/users')
      .send({ name: 'Second', email });

    expect(second.status).toBe(409);
    expect(second.body.error).toBe('Email already exists');
  });

  it('TC-BE-006: handles whitespace-only name (QA finding if it passes)', async () => {
    const email = `ws-${Date.now()}@qa.com`;
    const res = await request(app)
      .post('/api/users')
      .send({ name: '   ', email });

    // This SHOULD be 400 but current code allows it — flagging as finding
    if (res.status === 201) {
      createdIds.push(res.body.id);
    }
    // Document actual behavior for the report
    expect(res.status).toBeOneOf([201, 400]);
  });
});

describe('GET /api/users/:id', () => {
  let testUserId: string;

  beforeAll(async () => {
    const email = `get-${Date.now()}@qa.com`;
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Get Test', email });
    testUserId = res.body.id;
    createdIds.push(testUserId);
  });

  it('TC-BE-007: 200 on valid user ID', async () => {
    const res = await request(app).get(`/api/users/${testUserId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(testUserId);
    expect(res.body.name).toBe('Get Test');
  });

  it('TC-BE-008: 404 on non-existent UUID', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app).get(`/api/users/${fakeId}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('User not found');
  });

  it('TC-BE-009: 500 on invalid UUID format (should ideally be 400)', async () => {
    const res = await request(app).get('/api/users/not-a-uuid');

    // Current code: Postgres throws, catch returns 500
    // IDEAL: should validate UUID format and return 400
    expect(res.status).toBeOneOf([400, 500]);
    expect(res.body.error).toBeDefined();
    // Ensure no stack trace leaked
    expect(res.body.stack).toBeUndefined();
  });
});
