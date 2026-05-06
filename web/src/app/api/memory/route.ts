import { NextRequest } from 'next/server';
import { getUserMemory } from '@backend/tools/memory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id');
  if (!userId) {
    return Response.json({ error: 'user_id required' }, { status: 400 });
  }
  try {
    const memory = await getUserMemory(userId);
    return Response.json(memory);
  } catch (err: any) {
    console.error('[/api/memory] error:', err);
    return Response.json({ error: 'memory unavailable' }, { status: 500 });
  }
}
