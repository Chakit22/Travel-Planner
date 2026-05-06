import 'dotenv/config';
import { db } from '../db/client';
import { trips } from '../db/schema';
import { eq } from 'drizzle-orm';

interface TripMetadataInput {
  trip_id: string;
  destination?: string;
  origin?: string;
  departure_date?: string; // YYYY-MM-DD
  return_date?: string; // YYYY-MM-DD
  travelers?: number;
  budget?: number;
}

export async function update_trip_metadata_handler(
  input: TripMetadataInput,
): Promise<string> {
  if (!input.trip_id) {
    return JSON.stringify({ ok: false, message: 'trip_id missing' });
  }

  const patch: Record<string, any> = { updatedAt: new Date() };
  if (input.destination !== undefined) patch.destination = input.destination;
  if (input.origin !== undefined) patch.origin = input.origin;
  if (input.departure_date !== undefined) patch.departureDate = input.departure_date;
  if (input.return_date !== undefined) patch.returnDate = input.return_date;
  if (typeof input.travelers === 'number') patch.travelers = input.travelers;
  if (typeof input.budget === 'number') patch.budget = input.budget;

  if (Object.keys(patch).length === 1) {
    return JSON.stringify({ ok: false, message: 'no fields to update' });
  }

  try {
    const result = await db
      .update(trips)
      .set(patch)
      .where(eq(trips.id, input.trip_id))
      .returning({ id: trips.id });
    if (result.length === 0) {
      return JSON.stringify({ ok: false, message: `trip ${input.trip_id} not found` });
    }
    console.log(`[trip] update_trip_metadata for ${input.trip_id}:`, patch);
    return JSON.stringify({
      ok: true,
      message: `updated trip with: ${Object.keys(patch).filter((k) => k !== 'updatedAt').join(', ')}`,
    });
  } catch (err: any) {
    console.error('[trip] update_trip_metadata failed:', err.message);
    return JSON.stringify({ ok: false, message: err.message });
  }
}
