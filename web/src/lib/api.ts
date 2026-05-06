const API_BASE = 'http://localhost:3001';

// ─── TYPES ──────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface Trip {
  id: string;
  userId: string;
  destination: string | null;
  origin: string | null;
  departureDate: string | null;
  returnDate: string | null;
  travelers: number | null;
  budget: number | null;
  status: string;
  itinerary: string | null;
  itineraryVersion: number;
  suggestions: Suggestion[];
  createdAt: string;
  updatedAt: string;
}

export interface Suggestion {
  type: string;
  reason: string;
  newItinerary: string;
  createdAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'status';
  content: string;
  tool?: string;
}

// ─── SSE EVENT TYPES ────────────────────────────────────────────────────────

export type SSEEvent =
  | { type: 'status'; data: { tool: string; status: string } }
  | { type: 'message'; data: { text: string } }
  | { type: 'itinerary'; data: { version: number; text: string } }
  | { type: 'error'; data: { error: string } }
  | { type: 'done'; data: Record<string, never> };

// ─── FETCH HELPERS ──────────────────────────────────────────────────────────

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// ─── USER API ───────────────────────────────────────────────────────────────

export async function createUser(name: string, email: string, password: string): Promise<User> {
  return fetchJSON('/api/users', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
}

export async function getUser(id: string): Promise<User> {
  return fetchJSON(`/api/users/${id}`);
}

export async function loginUser(email: string, password: string): Promise<User> {
  return fetchJSON('/api/users/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// ─── TRIP API ───────────────────────────────────────────────────────────────

export async function createTrip(userId: string): Promise<Trip> {
  return fetchJSON('/api/trips', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function getTrips(userId: string): Promise<Trip[]> {
  return fetchJSON(`/api/trips?user_id=${userId}`);
}

export async function getTrip(id: string): Promise<Trip> {
  return fetchJSON(`/api/trips/${id}`);
}

export async function updateTrip(
  id: string,
  data: Partial<Pick<Trip, 'status' | 'destination' | 'origin'>> & {
    acceptSuggestion?: number;
    dismissSuggestion?: number;
  },
): Promise<Trip> {
  return fetchJSON(`/api/trips/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteTrip(id: string): Promise<void> {
  await fetchJSON(`/api/trips/${id}`, { method: 'DELETE' });
}

// ─── CHAT HISTORY ──────────────────────────────────────────────────────────

export async function getChatHistory(
  tripId: string,
): Promise<{ messages: ChatMessage[] }> {
  return fetchJSON(`/api/trips/${tripId}/chat`);
}

// ─── ATLAS V2: MEMORY + COMPANION CHAT (Next.js routes) ────────────────────

export interface AtlasChatRequest {
  userId: string;
  tripId?: string;
  message: string;
  mode?: 'planner' | 'companion';
  geolocation?: { lat: number; lng: number; accuracy_m?: number } | null;
}

export interface AtlasChatResponse {
  reply: string;
  toolCalls: string[];
}

export async function postAtlasChat(req: AtlasChatRequest): Promise<AtlasChatResponse> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Atlas error: ${res.status}`);
  }
  return res.json();
}

// ─── ATLAS V2: STREAMING CHAT (SSE) ────────────────────────────────────────

export type AtlasStreamEvent =
  | { type: 'tool_start'; name: string }
  | { type: 'tool_done'; name: string }
  | { type: 'text_delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * Streams an Atlas chat reply over SSE. Calls onEvent for each event.
 * Returns an AbortController so the caller can cancel mid-stream.
 */
export function streamAtlasChat(
  req: AtlasChatRequest,
  onEvent: (event: AtlasStreamEvent) => void,
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        onEvent({ type: 'error', message: body.error || `Atlas error: ${res.status}` });
        onEvent({ type: 'done' });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // Frames are separated by a blank line.
        const frames = buf.split('\n\n');
        buf = frames.pop() ?? '';

        for (const frame of frames) {
          if (!frame.trim()) continue;
          let evt = '';
          let data = '';
          for (const line of frame.split('\n')) {
            if (line.startsWith('event: ')) evt = line.slice(7).trim();
            else if (line.startsWith('data: ')) data = line.slice(6);
          }
          if (!evt) continue;
          let parsed: any = {};
          try {
            parsed = JSON.parse(data);
          } catch {
            // ignore malformed
          }
          onEvent({ type: evt as any, ...parsed });
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      onEvent({ type: 'error', message: err?.message ?? 'connection lost' });
      onEvent({ type: 'done' });
    }
  })();

  return controller;
}

export interface AtlasMemory {
  profile: { name?: string; travelStyle?: string; budgetTier?: string; homeCity?: string; summary?: string; tags?: string[] } | null;
  pastTrips: Array<{ destination: string | null; departureDate: string | null; returnDate: string | null; travelers: number | null; budget: number | null }>;
  likes: Array<{ category: string; item: string }>;
  dislikes: Array<{ category: string; item: string }>;
}

export async function fetchAtlasMemory(userId: string): Promise<AtlasMemory> {
  const res = await fetch(`/api/memory?user_id=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error(`memory fetch failed: ${res.status}`);
  return res.json();
}

export async function savePreference(args: {
  userId: string;
  category: string;
  item: string;
  sentiment: 'like' | 'dislike';
  context?: string;
}): Promise<{ ok: boolean; message: string }> {
  const res = await fetch('/api/preference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Preference save failed: ${res.status}`);
  }
  return res.json();
}

// ─── SSE CHAT CLIENT (legacy — kept for fallback) ──────────────────────────

export function streamChat(
  tripId: string,
  message: string,
  onEvent: (event: SSEEvent) => void,
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/api/trips/${tripId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        onEvent({ type: 'error', data: { error: 'Connection failed' } });
        onEvent({ type: 'done', data: {} });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent({ type: currentEvent, data } as SSEEvent);
            } catch {
              // Skip malformed JSON
            }
            currentEvent = '';
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onEvent({ type: 'error', data: { error: 'Connection lost' } });
        onEvent({ type: 'done', data: {} });
      }
    });

  return controller;
}
