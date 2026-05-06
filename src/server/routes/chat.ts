import { Router } from 'express';
import { db } from '../../db/client';
import { trips, conversations } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { streamAgentResponse } from '../services/agent';

export const chatRouter = Router();

// GET /api/trips/:id/chat — load conversation history
chatRouter.get('/:id/chat', async (req, res) => {
  try {
    const [convo] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.tripId, req.params.id));

    if (!convo) {
      return res.json({ messages: [], phase: 'gathering' });
    }

    // Support both Anthropic SDK format ({ role, content }) and legacy LangChain format ({ type, data })
    const stored = (convo.messages as any[]) || [];
    const messages = stored
      .filter((m: any) => m.role === 'user' || m.role === 'assistant' || m.type === 'human' || m.type === 'ai')
      .map((m: any) => {
        // Anthropic SDK format
        if (m.role === 'user' || m.role === 'assistant') {
          const content = typeof m.content === 'string'
            ? m.content
            : Array.isArray(m.content)
              ? m.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('')
              : '';
          return { role: m.role as 'user' | 'assistant', content };
        }
        // Legacy LangChain format
        const content =
          typeof m.data?.content === 'string'
            ? m.data.content
            : Array.isArray(m.data?.content)
              ? m.data.content.filter((p: any) => p.type === 'text' && p.text).map((p: any) => p.text).join('')
              : '';
        return { role: m.type === 'human' ? 'user' : 'assistant' as 'user' | 'assistant', content };
      })
      .filter((m: any) => m.content.trim());

    res.json({ messages });
  } catch (err) {
    console.error('Load chat history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/trips/:id/chat — send message, get SSE stream back
chatRouter.post('/:id/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    // Verify trip exists
    const [trip] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, req.params.id));

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Stream agent response
    await streamAgentResponse(trip.id, message, res);

    res.end();
  } catch (err) {
    console.error('Chat error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.end();
    }
  }
});
