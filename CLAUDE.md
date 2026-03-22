# CLAUDE.md — Atlas Travel Planner

## Project Overview

Multi-agent travel planner CLI. Agent name: **Atlas**. Built with LangGraph + Gemini 2.5 Flash + SerpApi + Serper.dev.

## Architecture

Two-phase state graph:
- **Gathering phase**: No tools bound. Collects destination, origin, exact dates, traveler count, optional budget/preferences via conversation.
- **Planning phase**: 4 tools bound (flight, hotel, activity, itinerary agents). Searches and compiles full itinerary.

Phase transition triggered by `[READY_TO_PLAN]` marker in gathering node output.

## Key Files

- `src/agents/supervisor.ts` — Two-phase graph, gathering + planning nodes, routing logic
- `src/prompts/shared.ts` — Shared guardrails, error handling, identity (appended to ALL agent prompts)
- `src/tools/serpapi.ts` — Google Flights + Hotels (currently in **mock mode** — remove mock blocks to use real API)
- `src/tools/serper.ts` — Places, restaurants, local info (used by activity agent)
- `src/index.ts` — CLI loop, session persistence, `chat()` (stdout) vs `debug()` (stderr) output

## Commands

```bash
npm start           # run the CLI
npm start 2>/dev/null  # chat only, no debug
```

## Conventions

- **Prompt structure**: CONTEXT → TASK → OUTPUT → CONSTRAINTS → guardrails (Gemini 3 prompting guide)
- **Temperature**: 1.0 for all models (Gemini 3 guide recommends not lowering)
- **No emojis** in agent responses or user-facing output
- **Guardrails**: Defined once in `src/prompts/shared.ts`, imported by all agents
- **Date context**: Computed per-invocation via `getDateContext()`, not module-level constants
- **Mock mode**: serpapi.ts has mock data blocks before real API calls. Delete mock + uncomment real code to switch.

## Environment Variables

Required in `.env`:
- `GOOGLE_API_KEY` — Gemini API
- `SERPAPI_API_KEY` — SerpApi (Google Flights/Hotels)
- `SERPER_API_KEY` — Serper.dev (Places/Restaurants)

Optional:
- `USER_DEFAULT_ORIGIN` — Default departure city

## Important Notes

- Gemini 3 Flash (`gemini-3-flash-preview`) requires `thought_signature` support which `@langchain/google-genai@0.2.x` does not have. Stick with `gemini-2.5-flash` until LangChain JS merges the fix.
- SerpApi free tier: 250 queries/month. ~4 calls per trip = ~62 trips/month.
- `searchAnything` tool is removed from supervisor. Gathering phase has zero tools.
- Session file (`.conversation-session.json`) persists messages + phase between runs.
