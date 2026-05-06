/**
 * Seed the demo user (chakit-demo) for the Atlas v2 demo.
 *
 * Idempotent: running twice produces the same state.
 *
 * Usage:
 *   npx tsx scripts/seed-demo-user.ts
 */
import 'dotenv/config';
import { db, sql } from '../src/db/client';
import { users, trips, userProfiles, preferences } from '../src/db/schema';
import { eq, and } from 'drizzle-orm';

const DEMO_EMAIL = 'chakit-demo@atlas.dev';
const DEMO_NAME = 'Chakit';
const DEMO_PASSWORD = 'demo';

interface SeedTrip {
  destination: string;
  origin: string;
  departureDate: string;
  returnDate: string;
  travelers: number;
  budget: number;
  status: 'completed' | 'draft' | 'approved';
  itinerary: string;
}

const SEED_TRIPS: SeedTrip[] = [
  {
    destination: 'Bali',
    origin: 'Melbourne',
    departureDate: '2026-01-12',
    returnDate: '2026-01-22',
    travelers: 2,
    budget: 4200,
    status: 'completed',
    itinerary:
      'Day 1 — Arrival in Denpasar, transfer to Ubud boutique villa. Quiet welcome dinner in town.\n' +
      'Day 2-4 — Rice terrace walks, Ubud monkey forest, sunset cocktails at Bambu Indah.\n' +
      'Day 5-7 — Move to Uluwatu. Surf lessons, seafood dinners on the cliff.\n' +
      'Day 8-10 — Nusa Lembongan day trip, snorkelling, slow farewell.',
  },
  {
    destination: 'Tokyo',
    origin: 'Melbourne',
    departureDate: '2025-10-04',
    returnDate: '2025-10-13',
    travelers: 2,
    budget: 5800,
    status: 'completed',
    itinerary:
      'Day 1-3 — Shibuya boutique stay. Coffee crawls in Shimokitazawa, Meiji shrine, izakaya in Ebisu.\n' +
      'Day 4-6 — Shinkansen to Kyoto. Fushimi Inari before sunrise, kaiseki dinner in Gion.\n' +
      'Day 7-9 — Back to Tokyo. Tsukiji breakfast, Ghibli museum, tempura omakase in Ginza.',
  },
  {
    destination: 'Bangkok',
    origin: 'Melbourne',
    departureDate: '2025-07-15',
    returnDate: '2025-07-21',
    travelers: 2,
    budget: 2900,
    status: 'completed',
    itinerary:
      'Day 1 — Riverside boutique check-in. Sunset rooftop drinks at Lebua.\n' +
      'Day 2-4 — Grand Palace, Wat Pho, food markets in Chinatown, longtail boat through klongs.\n' +
      'Day 5-6 — Day trip to Ayutthaya, massage marathon, last night at Gaa.',
  },
  // ─── LIVE TRIP — overlaps today's date so companion mode auto-engages ────
  {
    destination: 'Sydney',
    origin: 'Melbourne',
    departureDate: '2026-05-03',
    returnDate: '2026-05-08',
    travelers: 2,
    budget: 1800,
    status: 'approved',
    itinerary:
      'Day 1 — Arrive MEL→SYD. Check in at Pier One boutique on Walsh Bay. Sunset walk to the Opera House.\n' +
      'Day 2 — Bondi to Coogee coastal walk in the morning. Late lunch in Bronte. Afternoon at the Art Gallery of NSW.\n' +
      'Day 3 — Ferry to Manly, beach and a long lunch. Evening jazz in Surry Hills.\n' +
      'Day 4 — Slow morning. Brunch in Paddington. Browse Strand Arcade. Easy last dinner at Tetsuya before flying back.',
  },
];

interface SeedPreference {
  category: string;
  item: string;
  sentiment: 'like' | 'dislike';
  context?: string;
}

const SEED_PREFERENCES: SeedPreference[] = [
  { category: 'cuisine', item: 'seafood', sentiment: 'like', context: 'Loved cliff seafood in Uluwatu' },
  { category: 'cuisine', item: 'street food', sentiment: 'like', context: 'Bangkok highlights' },
  { category: 'hotel_type', item: 'boutique hotels', sentiment: 'like' },
  { category: 'hotel_type', item: 'hostels', sentiment: 'dislike', context: 'Prefer privacy' },
  { category: 'vibe', item: 'sunrise temples', sentiment: 'like', context: 'Fushimi Inari empty at 6am' },
  { category: 'budget', item: 'mid-range', sentiment: 'like' },
  { category: 'transport', item: 'package tours', sentiment: 'dislike' },
  { category: 'activity', item: 'walking tours', sentiment: 'like', context: 'Slow exploration' },
];

const PROFILE_SUMMARY =
  'Mid-range traveller from Melbourne. Goes for boutique stays, seafood, slow walking days. Avoids hostels and package tours. Has hit Bali, Tokyo, Bangkok in the last year.';

async function main() {
  console.log('[seed] starting…');

  // ── 1. Upsert user ─────────────────────────────────────────────
  let [user] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
  if (!user) {
    [user] = await db
      .insert(users)
      .values({ name: DEMO_NAME, email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .returning();
    console.log(`[seed] created user ${user.id} (${DEMO_EMAIL})`);
  } else {
    console.log(`[seed] user exists ${user.id} (${DEMO_EMAIL})`);
  }

  // ── 2. Upsert profile ──────────────────────────────────────────
  const [existingProfile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, user.id));
  if (!existingProfile) {
    await db.insert(userProfiles).values({
      userId: user.id,
      travelStyle: 'slow + boutique',
      budgetTier: 'mid-range',
      homeCity: 'Melbourne',
      summary: PROFILE_SUMMARY,
      tags: ['boutique', 'seafood', 'walking', 'sunrise', 'culture'],
    });
    console.log('[seed] inserted profile');
  } else {
    await db
      .update(userProfiles)
      .set({
        summary: PROFILE_SUMMARY,
        tags: ['boutique', 'seafood', 'walking', 'sunrise', 'culture'],
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, user.id));
    console.log('[seed] refreshed profile');
  }

  // ── 3. Upsert past trips ───────────────────────────────────────
  for (const t of SEED_TRIPS) {
    const [existing] = await db
      .select()
      .from(trips)
      .where(and(eq(trips.userId, user.id), eq(trips.destination, t.destination)));
    if (!existing) {
      await db.insert(trips).values({
        userId: user.id,
        destination: t.destination,
        origin: t.origin,
        departureDate: t.departureDate,
        returnDate: t.returnDate,
        travelers: t.travelers,
        budget: t.budget,
        status: t.status,
        itinerary: t.itinerary,
      });
      console.log(`[seed] inserted trip: ${t.destination}`);
    } else {
      await db
        .update(trips)
        .set({
          origin: t.origin,
          departureDate: t.departureDate,
          returnDate: t.returnDate,
          travelers: t.travelers,
          budget: t.budget,
          status: t.status,
          itinerary: t.itinerary,
          updatedAt: new Date(),
        })
        .where(eq(trips.id, existing.id));
      console.log(`[seed] refreshed trip: ${t.destination}`);
    }
  }

  // ── 4. Upsert preferences (idempotent by user+category+item+sentiment) ──
  for (const p of SEED_PREFERENCES) {
    const [existing] = await db
      .select({ id: preferences.id })
      .from(preferences)
      .where(
        and(
          eq(preferences.userId, user.id),
          eq(preferences.category, p.category),
          eq(preferences.item, p.item),
          eq(preferences.sentiment, p.sentiment),
        ),
      );
    if (!existing) {
      await db.insert(preferences).values({
        userId: user.id,
        category: p.category,
        item: p.item,
        sentiment: p.sentiment,
        source: 'seed',
        context: p.context ?? null,
      });
      console.log(`[seed] preference: ${p.sentiment} ${p.item} (${p.category})`);
    }
  }

  console.log('\n[seed] done.');
  console.log(`  → login email:    ${DEMO_EMAIL}`);
  console.log(`  → login password: ${DEMO_PASSWORD}`);
  console.log(`  → user id:        ${user.id}`);

  await sql.end();
}

main().catch(async (err) => {
  console.error('[seed] failed:', err);
  await sql.end();
  process.exit(1);
});
