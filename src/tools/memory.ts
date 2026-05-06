import 'dotenv/config';
import { db } from '../db/client';
import { users, trips, userProfiles, preferences } from '../db/schema';
import { eq, desc, and } from 'drizzle-orm';

export interface UserMemory {
  profile: {
    name?: string;
    travelStyle?: string;
    budgetTier?: string;
    homeCity?: string;
    summary?: string;
    tags?: string[];
  } | null;
  pastTrips: Array<{
    destination: string | null;
    departureDate: string | null;
    returnDate: string | null;
    travelers: number | null;
    budget: number | null;
  }>;
  likes: Array<{ category: string; item: string; context?: string | null }>;
  dislikes: Array<{ category: string; item: string; context?: string | null }>;
}

const EMPTY_MEMORY: UserMemory = {
  profile: null,
  pastTrips: [],
  likes: [],
  dislikes: [],
};

// ─── READ ───────────────────────────────────────────────────────────────────

export async function getUserMemory(userId: string): Promise<UserMemory> {
  if (!userId) return EMPTY_MEMORY;

  try {
    const [userRow] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    const tripRows = await db
      .select({
        destination: trips.destination,
        departureDate: trips.departureDate,
        returnDate: trips.returnDate,
        travelers: trips.travelers,
        budget: trips.budget,
        status: trips.status,
      })
      .from(trips)
      .where(eq(trips.userId, userId))
      .orderBy(desc(trips.returnDate))
      .limit(5);

    const past = tripRows.filter(
      (t) => t.status === 'completed' || (t.returnDate && new Date(t.returnDate) < new Date()),
    );

    const prefRows = await db
      .select()
      .from(preferences)
      .where(eq(preferences.userId, userId))
      .orderBy(desc(preferences.createdAt))
      .limit(50);

    return {
      profile: profile
        ? {
            name: userRow?.name,
            travelStyle: profile.travelStyle ?? undefined,
            budgetTier: profile.budgetTier ?? undefined,
            homeCity: profile.homeCity ?? undefined,
            summary: profile.summary ?? undefined,
            tags: Array.isArray(profile.tags) ? (profile.tags as string[]) : [],
          }
        : userRow
          ? { name: userRow.name }
          : null,
      pastTrips: past.map((t) => ({
        destination: t.destination,
        departureDate: t.departureDate,
        returnDate: t.returnDate,
        travelers: t.travelers,
        budget: t.budget,
      })),
      likes: prefRows
        .filter((p) => p.sentiment === 'like')
        .map((p) => ({ category: p.category, item: p.item, context: p.context })),
      dislikes: prefRows
        .filter((p) => p.sentiment === 'dislike')
        .map((p) => ({ category: p.category, item: p.item, context: p.context })),
    };
  } catch (err: any) {
    console.error('[memory] getUserMemory failed:', err.message);
    return EMPTY_MEMORY;
  }
}

// ─── FORMATTING (for prompt injection) ──────────────────────────────────────

export function formatMemoryForPrompt(memory: UserMemory): string {
  if (!memory.profile && memory.pastTrips.length === 0 && memory.likes.length === 0 && memory.dislikes.length === 0) {
    return 'USER MEMORY:\nNew user. No past trips or preferences on file yet.';
  }

  const lines: string[] = ['USER MEMORY:'];

  if (memory.profile?.name) lines.push(`Name: ${memory.profile.name}`);
  if (memory.profile?.homeCity) lines.push(`Home: ${memory.profile.homeCity}`);
  if (memory.profile?.travelStyle) lines.push(`Travel style: ${memory.profile.travelStyle}`);
  if (memory.profile?.budgetTier) lines.push(`Budget tier: ${memory.profile.budgetTier}`);
  if (memory.profile?.summary) lines.push(`Summary: ${memory.profile.summary}`);

  if (memory.pastTrips.length > 0) {
    lines.push('Past trips:');
    for (const t of memory.pastTrips) {
      const dates = t.departureDate ? ` (${t.departureDate} → ${t.returnDate ?? '?'})` : '';
      lines.push(`  - ${t.destination ?? 'unknown'}${dates}`);
    }
  }

  if (memory.likes.length > 0) {
    const summary = memory.likes
      .slice(0, 12)
      .map((l) => `${l.item} [${l.category}]`)
      .join(', ');
    lines.push(`Likes: ${summary}`);
  }

  if (memory.dislikes.length > 0) {
    const summary = memory.dislikes
      .slice(0, 12)
      .map((l) => `${l.item} [${l.category}]`)
      .join(', ');
    lines.push(`Dislikes: ${summary}`);
  }

  return lines.join('\n');
}

// ─── WRITE ──────────────────────────────────────────────────────────────────

export async function upsertPreference(args: {
  userId: string;
  category: string;
  item: string;
  sentiment: 'like' | 'dislike';
  source: 'chat' | 'button' | 'seed';
  context?: string;
}): Promise<{ ok: boolean; message: string }> {
  if (!args.userId) return { ok: false, message: 'missing userId' };
  if (!args.category || !args.item) return { ok: false, message: 'missing category or item' };

  try {
    // De-dupe: same user + category + item + sentiment → skip.
    const existing = await db
      .select({ id: preferences.id })
      .from(preferences)
      .where(
        and(
          eq(preferences.userId, args.userId),
          eq(preferences.category, args.category),
          eq(preferences.item, args.item),
          eq(preferences.sentiment, args.sentiment),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return { ok: true, message: `already saved: ${args.sentiment} ${args.item}` };
    }

    // If opposite sentiment exists, flip by inserting a new row (history preserved)
    await db.insert(preferences).values({
      userId: args.userId,
      category: args.category,
      item: args.item,
      sentiment: args.sentiment,
      source: args.source,
      context: args.context ?? null,
    });

    return { ok: true, message: `saved: ${args.sentiment} ${args.item}` };
  } catch (err: any) {
    console.error('[memory] upsertPreference failed:', err.message);
    return { ok: false, message: err.message };
  }
}

// ─── HANDLERS (Anthropic tool entrypoints) ──────────────────────────────────
// userId is auto-injected by the supervisor before invoking these.

export async function recall_user_preferences_handler(input: any): Promise<string> {
  const memory = await getUserMemory(input.user_id);
  return formatMemoryForPrompt(memory);
}

export async function save_user_preference_handler(input: any): Promise<string> {
  const result = await upsertPreference({
    userId: input.user_id,
    category: input.category,
    item: input.item,
    sentiment: input.sentiment,
    source: input.source ?? 'chat',
    context: input.context,
  });
  return JSON.stringify(result);
}
