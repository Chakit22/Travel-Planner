import { NextRequest } from 'next/server';
import {
  getAgent,
  persistAgent,
  type Geolocation,
  type SupervisorMode,
} from '@/lib/agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ChatBody {
  userId: string;
  tripId?: string;
  message: string;
  mode?: SupervisorMode;
  geolocation?: Geolocation | null;
}

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!body.userId) return Response.json({ error: 'userId required' }, { status: 400 });
  if (!body.message?.trim()) {
    return Response.json({ error: 'message required' }, { status: 400 });
  }

  const agent = await getAgent(body.userId, body.tripId);
  if (body.mode) agent.setMode(body.mode);
  if (body.geolocation !== undefined) agent.setGeolocation(body.geolocation);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      try {
        await agent.chatStream(body.message, (e) => {
          switch (e.type) {
            case 'tool_start':
              send('tool_start', { name: e.name });
              break;
            case 'tool_done':
              send('tool_done', { name: e.name });
              break;
            case 'text_delta':
              send('text_delta', { text: e.text });
              break;
            case 'done':
              send('done', {});
              break;
            case 'error':
              send('error', { message: e.message });
              break;
          }
        });
        if (body.tripId) await persistAgent(body.tripId, agent);
      } catch (err: any) {
        console.error('[/api/chat] stream error:', err);
        send('error', { message: 'Atlas hit a snag. Try again in a moment.' });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
