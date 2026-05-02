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

export async function createUser(name: string, email: string): Promise<User> {
  return fetchJSON('/api/users', {
    method: 'POST',
    body: JSON.stringify({ name, email }),
  });
}

export async function getUser(id: string): Promise<User> {
  return fetchJSON(`/api/users/${id}`);
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

// ─── SSE CHAT CLIENT ────────────────────────────────────────────────────────

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
