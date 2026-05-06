import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reset modules before each test to avoid import caching
beforeEach(() => {
  vi.resetModules();
});

describe('API fetch helpers', () => {
  it('createUser calls POST /api/users with name and email', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: '1', name: 'Test', email: 'test@test.com', createdAt: '2026-01-01' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { createUser } = await import('@/lib/api');
    const user = await createUser('Test', 'test@test.com');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/users'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Test', email: 'test@test.com' }),
      }),
    );
    expect(user.id).toBe('1');

    vi.unstubAllGlobals();
  });

  it('getTrips calls GET /api/trips with user_id query param', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { getTrips } = await import('@/lib/api');
    const trips = await getTrips('user-123');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/trips?user_id=user-123'),
      expect.any(Object),
    );
    expect(trips).toEqual([]);

    vi.unstubAllGlobals();
  });

  it('throws on non-ok response with error message from body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Bad request' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { createTrip } = await import('@/lib/api');
    await expect(createTrip('bad-id')).rejects.toThrow('Bad request');

    vi.unstubAllGlobals();
  });

  it('throws generic message when error body is unparseable', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { getTrip } = await import('@/lib/api');
    await expect(getTrip('123')).rejects.toThrow('Request failed: 500');

    vi.unstubAllGlobals();
  });

  it('deleteTrip calls DELETE method', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ deleted: true }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { deleteTrip } = await import('@/lib/api');
    await deleteTrip('trip-123');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/trips/trip-123'),
      expect.objectContaining({ method: 'DELETE' }),
    );

    vi.unstubAllGlobals();
  });

  it('updateTrip calls PATCH with correct body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'trip-1', status: 'approved' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { updateTrip } = await import('@/lib/api');
    const result = await updateTrip('trip-1', { status: 'approved' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/trips/trip-1'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      }),
    );
    expect(result.status).toBe('approved');

    vi.unstubAllGlobals();
  });
});
