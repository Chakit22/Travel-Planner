# Atlas - AI Travel Planner

![Atlas Demo](demo.gif)

A multi-agent travel planning assistant built with LangGraph and Gemini. Atlas collects your trip details through natural conversation, searches for real flights, hotels, activities, weather, and events, then lets you pick your preferred options before compiling a complete day-by-day itinerary.

## Features

- **Two-phase graph pattern** -- Gathering phase has zero tools bound, forcing the LLM to converse before acting. Planning phase binds 7 tools for parallel search and compilation.
- **Real-time flight and hotel prices** -- SerpApi pulls structured Google Flights and Google Hotels data with actual prices, not scraped snippets.
- **User selection flow** -- Presents top 5 flight and hotel options. You pick, then the itinerary is built around your choices.
- **Weather-aware itineraries** -- OpenWeatherMap 5-day forecast is passed to the itinerary agent so rainy days get indoor activities.
- **Live flight status** -- Check real-time status of any flight via AviationStack.
- **Local events integration** -- SerpApi Google Events surfaces concerts, festivals, and happenings during your trip dates.
- **Session persistence** -- Conversation state saves to disk. Resume where you left off across CLI restarts.
- **Prompt injection guardrails** -- Shared guardrails module blocks jailbreaks, off-topic requests, and social engineering attempts across all agents.
- **Streaming output** -- Uses LangGraph `.stream()` so you see progress in real time instead of waiting for the full graph to complete.

## Architecture

Atlas uses a **two-phase graph** pattern to separate conversation from action:

```
User
  |
  v
+--------------------------+
|   Phase 1: GATHERING     |  <- No tools bound (model can't call them)
|   Collect trip details    |  <- Exact dates, origin, destination, travelers
|   via conversation        |  <- Budget/preferences optional
+-----------+--------------+
            | [READY_TO_PLAN] marker detected
            v
+--------------------------+
|   Phase 2: PLANNING      |  <- 7 tools bound
|                           |
|   +-------------------+  |
|   | Flight Agent      |--|--> SerpApi (Google Flights)
|   | Hotel Agent       |--|--> SerpApi (Google Hotels)
|   | Activity Agent    |--|--> Serper.dev (Places, Restaurants)
|   | Itinerary Agent   |  |  <- No tools, compiles results
|   +-------------------+  |
|                           |
|   +-------------------+  |
|   | Weather           |--|--> OpenWeatherMap API
|   | Flight Status     |--|--> AviationStack API
|   | Events            |--|--> SerpApi (Google Events)
|   +-------------------+  |
+--------------------------+
            |
            v
  Top 5 options -> user picks -> full itinerary
```

### Why two phases?

Gemini Flash ignores system prompt instructions and calls tools immediately when they're available. By binding **zero tools** in the gathering phase, the model physically cannot make premature tool calls and is forced to have a conversation first.

### Planning sub-phases

1. **Search** -- Flight, hotel, activity, weather, and events tools are called in parallel.
2. **Present** -- Top 5 flights and top 5 hotels shown to the user for selection.
3. **Compile** -- User's chosen flight + hotel + activities + weather + events are passed to the itinerary agent.

## Tech Stack

- **LangGraph** -- State graph with manual state management (no checkpointer)
- **Gemini 2.5 Flash** -- LLM for all agents
- **SerpApi** -- Google Flights, Google Hotels, Google Events (structured data)
- **Serper.dev** -- Places, restaurants, and local info search
- **OpenWeatherMap** -- 5-day weather forecast
- **AviationStack** -- Live flight status
- **TypeScript** -- End to end

## Project Structure

```
src/
├── index.ts              # CLI chat loop, streaming, session persistence
├── prompts/
│   └── shared.ts         # Shared guardrails, error handling, agent identity
├── agents/
│   ├── supervisor.ts     # Two-phase graph (gathering → planning)
│   ├── flight.ts         # Flight search specialist (SerpApi)
│   ├── hotel.ts          # Hotel search specialist (SerpApi)
│   ├── activity.ts       # Activities & dining specialist (Serper.dev)
│   └── itinerary.ts      # Itinerary compiler (no tools)
└── tools/
    ├── serpapi.ts         # Google Flights + Hotels via SerpApi
    ├── serper.ts          # Places + restaurants via Serper.dev
    ├── weather.ts         # OpenWeatherMap 5-day forecast
    ├── flightStatus.ts   # AviationStack live flight status
    └── events.ts         # Google Events via SerpApi
```

## Setup

### Prerequisites

- Node.js 18+
- API keys for: Google AI (Gemini), SerpApi, Serper.dev, OpenWeatherMap, AviationStack

### Install

```bash
cd travel-planner
npm install
```

### Environment Variables

Create a `.env` file in the `travel-planner` directory:

```env
GOOGLE_API_KEY=your_gemini_api_key
SERPAPI_API_KEY=your_serpapi_key
SERPER_API_KEY=your_serper_key
OPENWEATHERMAP_API_KEY=your_openweathermap_key
AVIATIONSTACK_API_KEY=your_aviationstack_key
USER_DEFAULT_ORIGIN=Melbourne          # optional — default departure city
```

### Run

```bash
npm start
```

To separate chat from debug logs:

```bash
npm start 2>/dev/null          # chat only
npm start 2>debug.log          # debug logs to file
```

## Usage

```
──────────────────────────────────────────────────
  Atlas - Travel Planner
──────────────────────────────────────────────────

You: Plan a trip to Tokyo from Melbourne

Atlas: Sounds exciting! When are you flying out and coming back?

You: April 10 to April 14

Atlas: And how many travelers?

You: 2 adults, budget around $5000, we love street food and temples

Atlas: Got it! Let me search for the best options...

  [searches flights, hotels, activities, weather, events in parallel]

Atlas: Here are your top options:

  FLIGHTS
  1. Qantas QF79 — $1,240/person — 10h 15m direct
  2. ANA NH826 — $1,180/person — 9h 50m direct
  3. JAL JL774 — $1,320/person — 10h 5m direct
  ...

  HOTELS
  1. Shinjuku Granbell — $189/night — 4.2 stars
  2. Hotel Gracery Shinjuku — $165/night — 4.0 stars
  3. Mimaru Tokyo Ueno — $142/night — 4.3 stars
  ...

  Which flight and hotel do you prefer?

You: Flight 2 and hotel 3

Atlas: Great choices! Building your itinerary now...

  [compiles day-by-day itinerary with weather and events]

Atlas: Here's your complete Tokyo itinerary!

  DAY 1 — April 10 (Thu) — Partly cloudy, 18C
  ...
```

Commands:
- `new` -- Start a new trip
- `quit` -- Exit

### Record a Demo GIF

```bash
brew install charmbracelet/tap/vhs
vhs demo.tape
```

This generates `demo.gif` using [VHS](https://github.com/charmbracelet/vhs). Requires live API keys since LLM responses are real.

## Key Design Decisions

| Decision | Why |
|----------|-----|
| Two-phase graph | Gemini Flash calls tools immediately when available -- removing tools from gathering phase fixes this |
| Top 5 + user selection | Auto-selecting cheapest flight is fragile. Letting the user choose makes the itinerary feel personalized. |
| SerpApi over Serper.dev for flights/hotels | Serper returns Google Search snippets; SerpApi returns structured Google Flights/Hotels data with real prices |
| Shared guardrails module | Single source of truth for identity, error handling, topic gating, prompt injection defense |
| Streaming with `.stream()` | Users see progress at each step instead of 60 seconds of silence waiting for `.invoke()` |
| `getDateContext()` per-invocation | Date computed fresh so it stays accurate across long-running sessions |
| Chat/debug output separation | `stdout` for user-facing chat, `stderr` for internal debug -- keeps CLI clean |

## API Usage Budget

Per trip: ~5 SerpApi calls (1 flight + 1 hotel + 1 events + activity/restaurant via free Serper.dev)

250 SerpApi calls/month = ~50 trip plans/month on free tier.

## License

MIT
