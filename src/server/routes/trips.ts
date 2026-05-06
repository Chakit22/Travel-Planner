import { Router } from 'express';
import { db } from '../../db/client';
import { trips, conversations } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { replanTrip } from '../services/replan';

export const tripsRouter = Router();

// POST /api/trips — create trip
tripsRouter.post('/', async (req, res) => {
  try {
    const {
      userId,
      destination,
      origin,
      departureDate,
      returnDate,
      travelers,
    } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const [trip] = await db
      .insert(trips)
      .values({
        userId,
        destination,
        origin,
        departureDate,
        returnDate,
        travelers,
      })
      .returning();

    // Create associated conversation
    await db.insert(conversations).values({
      tripId: trip.id,
      messages: [],
    });

    res.status(201).json(trip);
  } catch (err: any) {
    const pgCode = err.code || err.cause?.code;
    if (pgCode === '23503') {
      return res.status(400).json({ error: 'User not found' });
    }
    console.error('Create trip error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/trips?user_id=x — list user's trips
tripsRouter.get('/', async (req, res) => {
  try {
    const userId = req.query.user_id as string;

    if (!userId) {
      return res.status(400).json({ error: 'user_id query param is required' });
    }

    const result = await db
      .select()
      .from(trips)
      .where(eq(trips.userId, userId))
      .orderBy(trips.createdAt);

    res.json(result);
  } catch (err) {
    console.error('List trips error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/trips/:id — get trip + latest itinerary
tripsRouter.get('/:id', async (req, res) => {
  try {
    const [trip] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, req.params.id));

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    res.json(trip);
  } catch (err) {
    console.error('Get trip error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/trips/:id — update trip (status, itinerary, accept/dismiss suggestions)
tripsRouter.patch('/:id', async (req, res) => {
  try {
    const {
      status,
      destination,
      origin,
      departureDate,
      returnDate,
      travelers,
      acceptSuggestion,
      dismissSuggestion,
    } = req.body;

    const [existing] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, req.params.id));

    if (!existing) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Accept a suggestion: move it into itinerary, bump version
    if (typeof acceptSuggestion === 'number') {
      const suggestions = (existing.suggestions as any[]) || [];
      const suggestion = suggestions[acceptSuggestion];
      if (!suggestion) {
        return res.status(400).json({ error: 'Invalid suggestion index' });
      }

      const remaining = suggestions.filter(
        (_: any, i: number) => i !== acceptSuggestion,
      );
      const [updated] = await db
        .update(trips)
        .set({
          itinerary: suggestion.newItinerary,
          itineraryVersion: (existing.itineraryVersion || 1) + 1,
          suggestions: remaining,
          status: 'approved',
          updatedAt: new Date(),
        })
        .where(eq(trips.id, req.params.id))
        .returning();

      return res.json(updated);
    }

    // Dismiss a suggestion
    if (typeof dismissSuggestion === 'number') {
      const suggestions = (existing.suggestions as any[]) || [];
      const remaining = suggestions.filter(
        (_: any, i: number) => i !== dismissSuggestion,
      );
      const [updated] = await db
        .update(trips)
        .set({
          suggestions: remaining,
          updatedAt: new Date(),
        })
        .where(eq(trips.id, req.params.id))
        .returning();

      return res.json(updated);
    }

    // General update
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (status) updateData.status = status;
    if (destination) updateData.destination = destination;
    if (origin) updateData.origin = origin;
    if (departureDate) updateData.departureDate = departureDate;
    if (returnDate) updateData.returnDate = returnDate;
    if (travelers) updateData.travelers = travelers;

    const [updated] = await db
      .update(trips)
      .set(updateData)
      .where(eq(trips.id, req.params.id))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error('Update trip error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/trips/:id/replan — manual replan trigger
tripsRouter.post('/:id/replan', async (req, res) => {
  try {
    const [trip] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, req.params.id));

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    if (!trip.itinerary) {
      return res.status(400).json({ error: 'Trip has no itinerary to replan' });
    }

    const reason = req.body.reason || 'Manual replan requested';
    await replanTrip(trip.id, reason);

    res.json({ status: 'replan_triggered', tripId: trip.id });
  } catch (err) {
    console.error('Replan error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/trips/:id — delete trip
tripsRouter.delete('/:id', async (req, res) => {
  try {
    const [deleted] = await db
      .delete(trips)
      .where(eq(trips.id, req.params.id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete trip error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
