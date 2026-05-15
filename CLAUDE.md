# CLAUDE.md

Guidance for Claude Code (and other AI assistants) when working in this repo. Keep this file short and operational — full product context lives in [`README.md`](README.md).

## What this repo is

**Atlas** — an AI travel companion built on Anthropic's Claude SDK. The repo is a small monorepo containing:

- **Root (`src/`)** — TypeScript backend: the Anthropic-SDK agent, tool implementations, Drizzle schema/migrations, and an Express API (deployed to Render). Also contains a legacy LangGraph + Gemini CLI agent.
- **`web/`** — Next.js 16 (App Router) frontend deployed to Vercel. Includes the SSE chat route (`/api/chat`) that runs the Anthropic tool-use loop server-side.

The two halves share `src/` code (agent, tools, DB, prompts). The frontend imports from `../src/...` at build time.

## Sub-project conventions

- **`web/` has its own `CLAUDE.md` / `AGENTS.md`.** It warns that this Next.js version has breaking changes vs. older training data. Before writing or modifying any code under `web/`, read `web/node_modules/next/dist/docs/` for the current API surface. Do not rely on memorized Next.js conventions there.
- This root `CLAUDE.md` applies to backend code (`src/`, `scripts/`, `drizzle/`, root configs). The `web/` guidance takes precedence inside `web/`.

## Common commands

Run from repo root unless noted.

```bash
# Backend agent / API
npm run start              # CLI agent (Anthropic, src/index-anthropic.ts is invoked via src/index.ts wiring)
npm run start:anthropic    # CLI agent (explicit Anthropic entry)
npm run dev                # CLI agent in watch mode
npm run server             # Express API (src/server.ts)
npm run server:dev         # Express API in watch mode

# Database (Drizzle + Postgres)
npm run db:generate        # Generate SQL migration from schema changes
npm run db:push            # Push schema to DB (dev)
npm run db:migrate         # Run migrations (src/db/migrate.ts)
npm run db:studio          # Drizzle Studio UI

# Tests
npm test                   # Vitest (backend tests in tests/backend/)
npm run test:watch

# Frontend
cd web && npm run dev      # Next.js dev server
cd web && npm run build    # Production build (also what Vercel runs)
```

There is no root lint script. Frontend linting lives in `web/` (ESLint flat config).

## Where things live

| Area | Path |
|---|---|
| Anthropic agent (used by web) | `src/agents/supervisor-anthropic.ts` |
| Legacy LangGraph agent (CLI) | `src/agents/supervisor.ts` |
| Tool definitions + handlers (Anthropic loop) | `src/tools/anthropic-tools.ts` |
| Individual tool implementations | `src/tools/{memory,osm,trip,serpapi,serper,weather,events,flightStatus,amadeus}.ts` |
| Shared system prompt / identity | `src/prompts/shared.ts` |
| Express API entrypoint | `src/server.ts` → `src/server/index.ts` |
| Express routes | `src/server/routes/{users,trips,chat}.ts` |
| Drizzle schema | `src/db/schema.ts` |
| Drizzle client | `src/db/client.ts` |
| Migrations | `drizzle/` |
| Demo seed | `scripts/seed-demo-user.ts` |
| Backend tests | `tests/backend/` |
| Frontend chat route | `web/src/app/api/chat/` |

## Conventions to preserve

- **Strict tool schemas.** Every tool in `src/tools/anthropic-tools.ts` has a regex-validated `input_schema` with `additionalProperties: false` and bounded integers. When adding or modifying a tool, keep schemas strict — the goal is that Claude cannot emit a malformed tool call.
- **Two-phase planning.** The supervisor agent has a gathering phase (no tools — forces conversation) and a planning phase (tools enabled). The flip is triggered by `[READY_TO_PLAN]` in the model output. Don't merge the phases.
- **Memory pre-warm.** Profile, past trips, and preferences are read once at session start and injected into the system prompt before turn 1. Don't move this into a tool call — the "knows you on turn 1" UX depends on the pre-warm.
- **In-memory agent cache.** Agents are cached as `Map<userId::tripId, Agent>` (see `web/src/lib/agent.ts`) and hydrated from the `conversations` table on cold start. Preserve this keying when touching session/cache code.
- **SSE, not WebSockets.** Streaming uses `client.messages.stream()` + Server-Sent Events. Keep the chat route stateless and SSE-shaped.

## Environment

`.env` at the repo root (used by Express, Drizzle, and the CLI agent). `web/.env.local` for the frontend. The full variable list is in [`README.md`](README.md#environment). At minimum the backend needs `DATABASE_URL` and `ANTHROPIC_API_KEY`.

## Deployment

- **Vercel** — frontend + `web/` API routes. Build is `cd web && next build` (configured in `vercel.json`).
- **Render** — Express API (`npx tsx src/server.ts`).
- **Neon** — Postgres. Note: Neon's pooler ships with an empty `search_path` — one-time fix is documented in `README.md`.

## Things not to do

- Don't introduce LangChain into the Anthropic path. The native SDK choice is deliberate (full control over the tool-use loop).
- Don't add tool calls that bypass the strict-schema convention.
- Don't write to `.github/workflows/` from an automated PR — the GitHub App lacks workflow-modification permission.
- Don't duplicate this file's content into the README or vice versa. Cross-link instead.
