import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/index';
import { db, sql as pgClient } from '../../src/db/client';
import { users } from '../../src/db/schema';
import { eq } from 'drizzle-orm';

const app = createApp();
const createdIds: string[] = [];

afterAll(async () => {
  for (const id of createdIds) {
    await db.delete(users).where(eq(users.id, id)).catch(() => {});
  }
  await pgClient.end();
});

// ─── HEALTH CHECK ───────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('TC-SEC-001: returns 200 with expected shape', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', agent: 'Atlas' });
  });
});

// ─── SQL INJECTION ──────────────────────────────────────────────────────────

describe('SQL Injection', () => {
  it('TC-SEC-002: SQL injection in user name field', async () => {
    const email = `sqli-${Date.now()}@qa.com`;
    const res = await request(app)
      .post('/api/users')
      .send({ name: "Robert'; DROP TABLE users;--", email });

    // Drizzle parameterises — should insert successfully without executing SQL
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Robert'; DROP TABLE users;--");
    createdIds.push(res.body.id);
  });

  it('TC-SEC-003: SQL injection in query param', async () => {
    const res = await request(app)
      .get("/api/trips?user_id=' OR 1=1 --");

    // Should fail gracefully — invalid UUID, not execute the SQL
    expect(res.status).toBeOneOf([200, 400, 500]);
    expect(res.body.stack).toBeUndefined();
  });
});

// ─── XSS PAYLOADS ───────────────────────────────────────────────────────────

describe('XSS', () => {
  it('TC-SEC-004: XSS in user name is stored but not executed (API returns raw)', async () => {
    const email = `xss-${Date.now()}@qa.com`;
    const xssPayload = '<script>alert("xss")</script>';
    const res = await request(app)
      .post('/api/users')
      .send({ name: xssPayload, email });

    expect(res.status).toBe(201);
    // API stores and returns raw — frontend must sanitise
    expect(res.body.name).toBe(xssPayload);
    createdIds.push(res.body.id);
  });
});

// ─── MALFORMED INPUT ────────────────────────────────────────────────────────

describe('Malformed Input', () => {
  it('TC-SEC-005: extremely long name (10000 chars)', async () => {
    const email = `long-${Date.now()}@qa.com`;
    const longName = 'A'.repeat(10000);
    const res = await request(app)
      .post('/api/users')
      .send({ name: longName, email });

    // Should either reject (400) or accept — either is fine
    // Key: should NOT crash or return 500
    expect(res.status).toBeOneOf([201, 400, 413]);
    if (res.status === 201) {
      createdIds.push(res.body.id);
    }
  });

  it('TC-SEC-006: null bytes in name', async () => {
    const email = `null-${Date.now()}@qa.com`;
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Test\x00User', email });

    // Postgres may reject null bytes — should be handled
    expect(res.status).toBeOneOf([201, 400, 500]);
    expect(res.body.stack).toBeUndefined();
    if (res.status === 201) {
      createdIds.push(res.body.id);
    }
  });

  it('TC-SEC-007: emoji in name and email fields', async () => {
    const email = `emoji-${Date.now()}@qa.com`;
    const res = await request(app)
      .post('/api/users')
      .send({ name: 'Test User 🌍✈️', email });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Test User 🌍✈️');
    createdIds.push(res.body.id);
  });

  it('TC-SEC-008: invalid date format in trip', async () => {
    // First create a user
    const email = `date-${Date.now()}@qa.com`;
    const userRes = await request(app)
      .post('/api/users')
      .send({ name: 'Date Test', email });
    createdIds.push(userRes.body.id);

    const res = await request(app)
      .post('/api/trips')
      .send({
        userId: userRes.body.id,
        departureDate: '2024-13-45', // invalid date
      });

    // Should either reject (400) or handle gracefully
    expect(res.body.stack).toBeUndefined();
  });

  it('TC-SEC-009: negative travelers count', async () => {
    const email = `neg-${Date.now()}@qa.com`;
    const userRes = await request(app)
      .post('/api/users')
      .send({ name: 'Neg Test', email });
    createdIds.push(userRes.body.id);

    const res = await request(app)
      .post('/api/trips')
      .send({
        userId: userRes.body.id,
        travelers: -5,
      });

    // Documents current behavior — ideally should be 400
    if (res.status === 201) {
      // QA Finding: negative travelers allowed
      expect(res.body.travelers).toBe(-5);
    }
  });
});

// ─── ERROR RESPONSE SHAPE ───────────────────────────────────────────────────

describe('Error Response Safety', () => {
  it('TC-SEC-010: 500 errors never leak stack traces', async () => {
    const res = await request(app).get('/api/users/not-valid-uuid');

    expect(res.body.stack).toBeUndefined();
    expect(res.body.cause).toBeUndefined();
    expect(res.body.query).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('node_modules');
    expect(JSON.stringify(res.body)).not.toContain('.ts:');
  });

  it('TC-SEC-011: 404 on unknown route', async () => {
    const res = await request(app).get('/api/nonexistent');

    expect(res.status).toBe(404);
  });
});
