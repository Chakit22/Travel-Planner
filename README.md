# Atlas — AI Travel Companion

Atlas is an AI travel companion built on Anthropic's Claude SDK. It plans a 10-day trip in ~2 minutes, remembers you across trips, and walks beside you on the ground via GPS-aware companion mode.

> **Live demo:** https://atlas-travel-planner-tau.vercel.app
> **Demo login:** `chakit-demo@atlas.dev` / `demo`

---

## What makes Atlas different

| Differentiator | What it means |
|---|---|
| **Cross-trip memory** | Atlas remembers your past trips, food preferences, hotel taste, and travel style — every conversation makes the next one better. |
| **Companion mode** | Trip dates overlap today + GPS lands you in-destination → Atlas auto-switches to live companion mode. Ask "what's open near me?" and get filtered, currently-open results. |
| **Streaming tool use** | Server-Sent Events stream every Claude tool call to the UI in real time — the user watches the agent think. |
| **Strict tool schemas** | Every tool has a regex-validated `input_schema` with `additionalProperties: false`. Claude can't hallucinate a malformed call. |

---

## Architecture

```
 Browser (Next.js)            Server (Next.js + Express)            External
 ───────────────────          ────────────────────────────          ──────────────────
 Chat panel ◄────SSE────►   /api/chat (Next.js)                  ┌► SerpApi      (flights, hotels)
 Itinerary panel               │                                  ├► Serper.dev   (places)
 Companion banner              ├─► Anthropic Claude (haiku-4-5)   ├► Overpass API (nearby + opening_hours)
 Geolocation API               │     │                            ├► OpenWeather  (forecast)
                               │     ├─ Tool-use loop until end_turn
 /api/users  /api/trips        │     │
 ───────────────────────       │     ▼
 Express API on Render         │   Tools (search_flights, search_hotels,
 (atlas-api-h7cq.onrender.com) │    search_places, find_nearby_places,
                               │    recall_user_preferences, save_user_preference,
                               │    update_trip_metadata, compose_itinerary)
                               │
                               ▼
                          Postgres (Neon, ap-southeast-2)
                          users · trips · conversations · user_profiles · preferences
```

Two visual diagrams ship in `diagrams/`:
- `diagrams/atlas-architecture.html` — system architecture + sequence diagram (technical)
- `diagrams/atlas-workflow.html` — non-technical workflow view

---

## Tech stack

- **Frontend** — Next.js 16 (App Router), Tailwind 4, deployed to Vercel
- **Agent** — Anthropic SDK (`@anthropic-ai/sdk`), Claude `haiku-4-5`, native tool-use loop
- **Streaming** — Server-Sent Events via `client.messages.stream()` + `streamEvent` handler
- **Database** — Postgres (Neon) via Drizzle ORM
- **Express API** — user/trip CRUD on Render (`src/server/`)
- **Tools** — SerpApi (flights/hotels), Serper.dev (places), OpenStreetMap Overpass + `opening_hours` (live nearby), OpenWeatherMap, AviationStack
- **CLI agent (legacy)** — original LangGraph + Gemini build still runs from `src/index.ts`

---

## Project structure

```
travel-planner/
├── web/                          # Next.js frontend + chat API route
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── chat/         # SSE streaming chat (Anthropic loop)
│   │   │   │   ├── memory/       # Cross-trip memory read
│   │   │   │   └── preference/   # Save user preferences
│   │   │   ├── trip/[id]/        # Trip detail page (chat + itinerary)
│   │   │   ├── login/, signup/   # Auth pages
│   │   │   └── page.tsx          # Trip list + memory hero
│   │   ├── components/           # ChatPanel, ItineraryView, CompanionToggle, etc.
│   │   └── lib/
│   │       ├── api.ts            # Frontend → Express API client
│   │       └── agent.ts          # In-memory agent cache (keyed by userId::tripId)
│   ├── tests/                    # Playwright e2e
│   └── package.json
│
├── src/                          # Backend code (shared by Express + Next.js)
│   ├── agents/
│   │   ├── supervisor.ts            # Original LangGraph two-phase agent (CLI)
│   │   └── supervisor-anthropic.ts  # Native Anthropic SDK agent (used by web/)
│   ├── tools/
│   │   ├── anthropic-tools.ts    # Tool defs + handlers for Anthropic loop
│   │   ├── memory.ts             # User profile/preferences/past-trip memory
│   │   ├── osm.ts                # OpenStreetMap + opening_hours
│   │   ├── trip.ts               # update_trip_metadata
│   │   ├── serpapi.ts            # Flights + hotels
│   │   ├── serper.ts             # Places, restaurants
│   │   ├── weather.ts, events.ts, flightStatus.ts
│   ├── server/                   # Express API (deployed to Render)
│   │   ├── index.ts
│   │   └── routes/users.ts, trips.ts, chat.ts
│   ├── db/                       # Drizzle schema + client
│   └── prompts/shared.ts         # Shared identity + guardrails
│
├── scripts/
│   └── seed-demo-user.ts         # Seeds chakit-demo + 4 trips (incl. live Sydney)
├── drizzle/                      # Migrations
├── diagrams/                     # Architecture + workflow diagrams (HTML)
├── INTERVIEW_SCRIPT.md           # Demo script
├── DIAGRAM_PROMPT.md             # Prompt that generated the diagrams
├── vercel.json                   # Vercel build config (root dir, cd web && next build)
├── Dockerfile, fly.toml          # Optional: container deploy
└── package.json                  # Root deps: drizzle, postgres, anthropic-sdk, etc.
```

---

## Getting started

### Prerequisites
- Node.js 20+
- Postgres (local or hosted — Neon works great)
- API keys: Anthropic, SerpApi, Serper.dev, OpenWeatherMap (optional)

### Install

```bash
git clone https://github.com/Chakit22/Travel-Planner
cd Travel-Planner
npm install
cd web && npm install && cd ..
```

### Environment

Create `.env` at the repo root (used by Express + Drizzle + agent):

```env
DATABASE_URL=postgres://user:pass@host:5432/atlas
ANTHROPIC_API_KEY=sk-ant-...
SERPAPI_API_KEY=...
SERPER_API_KEY=...
OPENWEATHERMAP_API_KEY=...
AVIATIONSTACK_API_KEY=...
USER_DEFAULT_ORIGIN=Melbourne
TRAVEL_PROVIDER=serper
```

Create `web/.env.local` for the frontend:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001   # Express API URL
```

See `.env.example` and `web/.env.example` for the full list.

### Database

```bash
npm run db:push         # apply Drizzle schema
npx tsx scripts/seed-demo-user.ts   # seed chakit-demo + 4 trips
```

### Run locally (three terminals)

```bash
# Terminal 1 — Express API (auth + trip CRUD)
npm run server

# Terminal 2 — Next.js frontend
cd web && npm run dev

# Terminal 3 — (optional) original CLI agent
npm start
```

Open http://localhost:3000 and log in with `chakit-demo@atlas.dev` / `demo`.

---

## Deployment

| Service | What | URL |
|---|---|---|
| Vercel | Next.js frontend + chat/memory/preference API routes | https://atlas-travel-planner-tau.vercel.app |
| Render | Express API (auth + trip CRUD) | https://atlas-api-h7cq.onrender.com |
| Neon | Postgres (ap-southeast-2) | — |

### Vercel
- Linked to repo root via `vercel.json` (`buildCommand: cd web && next build`)
- Env vars set with `vercel env add NAME production`

### Render
- Created via the Render MCP — Node runtime, `npm install`, `npx tsx src/server.ts`
- Same `DATABASE_URL` as Vercel

### One-time DB note
Neon's pooler ships with an empty `search_path`. Fix once with:

```sql
ALTER DATABASE neondb SET search_path TO public;
```

---

## Demo

The `INTERVIEW_SCRIPT.md` contains a 30-min demo script with three "wow" moments:

1. **Concierge moment** — Atlas suggests Vietnam-style trips on the first message because it remembers past Bali / Tokyo / Bangkok preferences.
2. **Streaming moment** — User watches every tool call appear inline ("Searching for flights…").
3. **Companion moment** — Open the seeded Sydney trip (May 3–8), spoof location to `-33.8688, 151.2093`, ask *"what's open right now?"* → live Overpass + opening-hours filter.

---

## Key design decisions

| Decision | Why |
|---|---|
| **Native Anthropic SDK over LangChain** | Full control over the tool-use loop, every message visible in trace. |
| **In-memory agent cache (`Map<userId::tripId, Agent>`)** | Tool-use context survives across requests; hydrates from `conversations` table on cold start. |
| **Memory pre-warm into system prompt** | One read at session start (profile + past trips + preferences) — Claude "knows" the user before turn 1. |
| **Strict tool schemas** | Regex patterns on dates, `additionalProperties: false`, integer bounds → Claude can't emit malformed tool calls. |
| **Two-phase planning** | Gathering phase has zero tools (forces conversation); planning phase has 8. Phase flips on `[READY_TO_PLAN]`. |
| **`update_trip_metadata` tool** | Trip destination/dates/budget written via a tool call so the model owns when to commit. |
| **OpenStreetMap + `opening_hours` lib** | Free, no API key, real-time "open now" filtering with closing-time hints. |
| **SSE over WebSockets** | Stateless, easier on Vercel, `client.messages.stream()` already gives us the right primitive. |

---

## Roadmap

- [ ] Booking integration (turn "here's what I'd book" into actual purchase)
- [ ] Eval harness for tool-call accuracy + itinerary quality
- [ ] Voice mode for companion ("Hey Atlas, recommend dinner")
- [ ] Multi-traveler shared trips

## License

MIT
