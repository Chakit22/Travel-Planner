import { Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { SupervisorAgent } from '../../agents/supervisor-anthropic';
import { db } from '../../db/client';
import { conversations, trips } from '../../db/schema';
import { eq } from 'drizzle-orm';

// ─── SSE HELPERS ────────────────────────────────────────────────────────────

function sendSSE(res: Response, event: string, data: any) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─── STREAM AGENT RESPONSE ─────────────────────────────────────────────────

export async function streamAgentResponse(
  tripId: string,
  userMessage: string,
  res: Response,
) {
  const [convo] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.tripId, tripId));

  if (!convo) {
    sendSSE(res, 'error', { error: 'Conversation not found' });
    sendSSE(res, 'done', {});
    return;
  }

  const agent = new SupervisorAgent();
  agent.messages = ((convo.messages as any[]) || []) as Anthropic.MessageParam[];

  try {
    // Intercept tool calls to emit status SSE events
    const originalChat = agent.chat.bind(agent);
    let statusProxy = false;

    // Patch: emit status events by watching messages after chat
    const prevLength = agent.messages.length;

    const reply = await originalChat(userMessage);

    // Emit status events for any tool_use blocks added during the call
    for (let i = prevLength; i < agent.messages.length; i++) {
      const msg = agent.messages[i];
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if ((block as any).type === 'tool_use') {
            sendSSE(res, 'status', { tool: (block as any).name, status: 'searching' });
          }
        }
      }
    }

    // Send the reply text
    if (reply.trim()) {
      sendSSE(res, 'message', { text: reply });
    }

    // Persist messages to DB
    await db
      .update(conversations)
      .set({ messages: agent.messages as any, updatedAt: new Date() })
      .where(eq(conversations.tripId, tripId));

    // Save itinerary if reply looks like a day-by-day plan
    if (reply.length > 500 && /day\s*\d/i.test(reply)) {
      const [trip] = await db.select().from(trips).where(eq(trips.id, tripId));
      if (trip) {
        const newVersion = (trip.itineraryVersion || 1) + 1;
        await db
          .update(trips)
          .set({ itinerary: reply, itineraryVersion: newVersion, updatedAt: new Date() })
          .where(eq(trips.id, tripId));
        sendSSE(res, 'itinerary', { version: newVersion, text: reply });
      }
    }

    sendSSE(res, 'done', {});
  } catch (err: any) {
    console.error('Agent stream error:', err);

    // Roll back the user message
    agent.messages.pop();
    await db
      .update(conversations)
      .set({ messages: agent.messages as any, updatedAt: new Date() })
      .where(eq(conversations.tripId, tripId));

    sendSSE(res, 'error', { error: 'Something went wrong. Please try again.' });
    sendSSE(res, 'done', {});
  }
}
