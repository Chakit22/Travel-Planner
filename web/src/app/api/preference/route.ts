import { NextRequest } from 'next/server';
import { upsertPreference } from '@backend/tools/memory';
import { invalidateUserMemoryEverywhere } from '@/lib/agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PreferenceBody {
  userId: string;
  category: string;
  item: string;
  sentiment: 'like' | 'dislike';
  context?: string;
}

export async function POST(req: NextRequest) {
  let body: PreferenceBody;
  try {
    body = (await req.json()) as PreferenceBody;
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }

  if (!body.userId || !body.category || !body.item || !body.sentiment) {
    return Response.json({ error: 'userId, category, item, sentiment required' }, { status: 400 });
  }
  if (body.sentiment !== 'like' && body.sentiment !== 'dislike') {
    return Response.json({ error: 'sentiment must be like|dislike' }, { status: 400 });
  }

  const result = await upsertPreference({
    userId: body.userId,
    category: body.category,
    item: body.item,
    sentiment: body.sentiment,
    source: 'button',
    context: body.context,
  });

  // Force every cached agent for this user to re-read memory on next turn,
  // so the new like/dislike is reflected immediately.
  invalidateUserMemoryEverywhere(body.userId);

  if (!result.ok) {
    return Response.json({ error: result.message }, { status: 500 });
  }
  return Response.json({ ok: true, message: result.message });
}
