import 'server-only';
import {
  SupervisorAgent,
  type Geolocation,
  type SupervisorMode,
} from '@backend/agents/supervisor-anthropic';
import { db } from '@backend/db/client';
import { conversations, trips } from '@backend/db/schema';
import { eq } from 'drizzle-orm';
import type Anthropic from '@anthropic-ai/sdk';

// In-memory cache: one agent PER (userId, tripId). Survives across requests
// within a single Next.js dev/server process. Lost on restart — chat is
// rehydrated from the conversations table on the first request after a restart.
const agents = new Map<string, SupervisorAgent>();

function key(userId: string, tripId?: string) {
  return tripId ? `${userId}::${tripId}` : userId;
}

/**
 * Get (or build) the agent for a (userId, tripId) pair.
 * On first build, hydrates messages from the conversations table.
 */
export async function getAgent(
  userId: string,
  tripId?: string,
): Promise<SupervisorAgent> {
  const k = key(userId, tripId);
  const existing = agents.get(k);
  if (existing) return existing;

  const agent = new SupervisorAgent({ userId, tripId });

  if (tripId) {
    try {
      const [convo] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.tripId, tripId));
      if (convo && Array.isArray(convo.messages)) {
        agent.messages = convo.messages as Anthropic.MessageParam[];
      }
    } catch (err: any) {
      console.warn('[agent] failed to hydrate from DB:', err.message);
    }
  }

  agents.set(k, agent);
  return agent;
}

/**
 * Heuristic: does this assistant reply look like a full day-by-day itinerary?
 * Long enough + mentions multiple "day N" markers.
 */
function looksLikeItinerary(text: string): boolean {
  if (!text || text.length < 500) return false;
  const matches = text.match(/day\s*\d+/gi);
  return (matches?.length ?? 0) >= 2;
}

/**
 * Pull the most recent assistant text reply out of the agent's message buffer.
 */
function lastAssistantText(agent: SupervisorAgent): string {
  const msgs = agent.messages as any[];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    if (m.role !== 'assistant') continue;
    if (typeof m.content === 'string') return m.content;
    if (Array.isArray(m.content)) {
      const text = m.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
      if (text.trim()) return text;
    }
  }
  return '';
}

/**
 * Persist the agent's current message buffer to the conversations table.
 * Also detects when the latest reply is a full itinerary and saves it onto
 * the trip row (status stays draft; user can Approve from the UI).
 * Idempotent: upserts on tripId.
 */
export async function persistAgent(tripId: string, agent: SupervisorAgent) {
  if (!tripId) return;
  try {
    const messages = agent.messages as any;
    const [existing] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.tripId, tripId));

    if (existing) {
      await db
        .update(conversations)
        .set({ messages, updatedAt: new Date() })
        .where(eq(conversations.tripId, tripId));
    } else {
      await db.insert(conversations).values({ tripId, messages });
    }

    const reply = lastAssistantText(agent);
    if (looksLikeItinerary(reply)) {
      const [trip] = await db
        .select({
          id: trips.id,
          itineraryVersion: trips.itineraryVersion,
          itinerary: trips.itinerary,
        })
        .from(trips)
        .where(eq(trips.id, tripId));
      if (trip && trip.itinerary !== reply) {
        const newVersion = (trip.itineraryVersion ?? 1) + 1;
        await db
          .update(trips)
          .set({
            itinerary: reply,
            itineraryVersion: newVersion,
            updatedAt: new Date(),
          })
          .where(eq(trips.id, tripId));
        console.log(`[agent] saved itinerary v${newVersion} for trip ${tripId}`);
      }
    }
  } catch (err: any) {
    console.error('[agent] persist failed:', err.message);
  }
}

export function resetAgent(userId: string, tripId?: string) {
  agents.delete(key(userId, tripId));
}

export function invalidateUserMemoryEverywhere(userId: string) {
  for (const [k, agent] of agents) {
    if (k === userId || k.startsWith(`${userId}::`)) {
      agent.invalidateMemory();
    }
  }
}

export type { Geolocation, SupervisorMode };
