# Claude Design Prompt — Atlas Diagrams

Paste this into a new Claude Code chat (use `/frontend-design` if available).

---

## THE PROMPT

Build two diagrams for "Atlas" — an AI travel companion on Anthropic's Claude SDK. Output: one self-contained HTML file, both diagrams stacked. Dark background, violet + brass accents, modern sans-serif, fits a 1440px screen, no scrollbars.

### Diagram 1 — Architecture (left-to-right)

Four columns:

1. **UI** — Next.js browser, chat panel + itinerary panel + companion banner, geolocation, SSE stream.
2. **Server** — Next.js `/api/chat` route, in-memory agent cache (keyed by userId::tripId), hydrates from Postgres.
3. **Agent core** — Claude (haiku-4-5), two-phase loop (Gathering → Planning), Anthropic tool-use loop until `end_turn`.
4. **Tools & Data** — SerpApi (flights, hotels), Serper (places), OpenStreetMap Overpass + `opening_hours` lib, memory tool, update_trip_metadata, Postgres via Drizzle.

Arrows flow user → UI → SSE → server → Claude → tools → Postgres and back. Label three moats: **cross-trip memory**, **GPS companion**, **streaming UX**.

### Diagram 2 — Sequence (top-to-bottom)

Lanes: User · Browser · API route · Claude · Tools/DB.

Flow for prompt *"Plan 10 days in Vietnam, July, $4000, 2 people"*:

1. User types → Browser opens SSE → API route loads cached agent + memory from Postgres
2. Server sends prompt → Claude returns `tool_use: search_flights`
3. Server streams `tool_start` to UI, calls SerpApi, streams `tool_done`, feeds result back
4. **Loop** repeats for hotels, places, update_trip_metadata
5. Claude streams text tokens (itinerary) → UI renders word by word
6. `end_turn` → server persists conversation + itinerary → closes SSE

Wrap the repeating tool calls in a "loop until end_turn" frame. Highlight token streaming.

### Style

- Background near-black (#0a0a0f), violet (#a78bfa), brass (#d4a574), off-white text
- Subtle glow on Claude, Postgres, SSE boxes
- Title: **"Atlas — Architecture & Flow"**
- Inline SVG/CSS only, no CDN

Single `index.html`. Open, screenshot each diagram.
