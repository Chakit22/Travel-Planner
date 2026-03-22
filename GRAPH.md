# Atlas Travel Planner — Graph Execution Flow

## Graph Structure

```
                    ┌─────────────────┐
                    │     __start__   │
                    └────────┬────────┘
                             │
                     routeStart(phase)
                       ╱            ╲
                      ╱              ╲
            'gathering'            'planning'
                    ╱                  ╲
     ┌──────────────┐          ┌──────────────┐
     │  gathering   │          │   planning   │◄──────────┐
     │              │          │              │           │
     │ gatheringLLM │          │ planningLLM  │           │
     │ (no tools)   │          │ (7 tools     │           │
     │              │          │  bound)      │           │
     └──────┬───────┘          └──────┬───────┘           │
            │                         │                    │
    afterGathering              afterPlanning              │
       ╱        ╲                 ╱        ╲               │
      ╱          ╲               ╱          ╲              │
phase still   phase changed  has            no             │
'gathering'   to 'planning'  tool_calls?    tool_calls     │
      │            │            │              │           │
      ▼            │            ▼              ▼           │
 ┌─────────┐      │    ┌────────────────┐  ┌─────────┐   │
 │ __end__ │      │    │ planning_tools │  │ __end__ │   │
 └─────────┘      │    │                │  └─────────┘   │
                  │    │ ToolNode       │                 │
                  │    │ (parallel      │                 │
                  │    │  execution)    │                 │
                  └──► │               ├─────────────────┘
                       └────────────────┘
                              edge

Tools bound to planning:
├── call_flight_agent    (subagent → search_flights via SerpApi)
├── call_hotel_agent     (subagent → search_hotels via SerpApi)
├── call_activity_agent  (subagent → search_places, search_restaurants, search_local_info via Serper)
├── call_itinerary_agent (subagent → no tools, compilation only)
├── search_weather       (direct → OpenWeatherMap API)
├── check_flight_status  (direct → AviationStack API)
└── search_events        (direct → SerpApi google_events)
```

## Message Array Evolution — Full Dry Run

### Turn 1: User starts conversation

```
phase: 'gathering'

── gatheringNode BEFORE ──────────────────────────────────
messages[0] HumanMessage: "Hey, plan me a trip"

── gatheringNode AFTER ───────────────────────────────────
messages[0] HumanMessage: "Hey, plan me a trip"
messages[1] AIMessage:    "G'day! Where are you headed?"

── afterGathering → END (phase still 'gathering')
```

### Turn 2: User provides trip details

```
phase: 'gathering'

── gatheringNode BEFORE ──────────────────────────────────
messages[0] HumanMessage: "Hey, plan me a trip"
messages[1] AIMessage:    "G'day! Where are you headed?"
messages[2] HumanMessage: "Melbourne to Sydney, April 1-4, 2 adults"

── gatheringNode AFTER ───────────────────────────────────
messages[0] HumanMessage: "Hey, plan me a trip"
messages[1] AIMessage:    "G'day! Where are you headed?"
messages[2] HumanMessage: "Melbourne to Sydney, April 1-4, 2 adults"
messages[3] AIMessage:    "Awesome, I've got everything! Let me hunt down the best options!"
phase: 'planning'  ← CHANGED (triggered by [READY_TO_PLAN] marker, now stripped)

── afterGathering → 'planning' (phase changed)

── planningNode BEFORE ───────────────────────────────────
messages[0] HumanMessage: "Hey, plan me a trip"
messages[1] AIMessage:    "G'day! Where are you headed?"
messages[2] HumanMessage: "Melbourne to Sydney, April 1-4, 2 adults"
messages[3] AIMessage:    "Awesome, I've got everything!..."
phase: 'planning'

── planningNode AFTER ────────────────────────────────────
messages[0] HumanMessage: "Hey, plan me a trip"
messages[1] AIMessage:    "G'day! Where are you headed?"
messages[2] HumanMessage: "Melbourne to Sydney, April 1-4, 2 adults"
messages[3] AIMessage:    "Awesome, I've got everything!..."
messages[4] AIMessage:    "One moment, let me search for flights and hotels!"
                          tool_calls: [call_flight_agent, call_hotel_agent,
                                       call_activity_agent, search_weather,
                                       search_events]

── afterPlanning → 'planning_tools' (has tool_calls)

── planningToolsNode BEFORE ──────────────────────────────
(same array as above, 5 messages)

── planningToolsNode AFTER ───────────────────────────────
messages[0]  HumanMessage: "Hey, plan me a trip"
messages[1]  AIMessage:    "G'day! Where are you headed?"
messages[2]  HumanMessage: "Melbourne to Sydney, April 1-4, 2 adults"
messages[3]  AIMessage:    "Awesome, I've got everything!..."
messages[4]  AIMessage:    "One moment..." + tool_calls[5]
messages[5]  ToolMessage:  tool_call_id=tc_1 → flight results JSON
messages[6]  ToolMessage:  tool_call_id=tc_2 → hotel results JSON
messages[7]  ToolMessage:  tool_call_id=tc_3 → activity results JSON
messages[8]  ToolMessage:  tool_call_id=tc_4 → weather results JSON
messages[9]  ToolMessage:  tool_call_id=tc_5 → events results JSON

── edge: planning_tools → planning

── planningNode BEFORE ───────────────────────────────────
(10 messages — sees all tool results)

── planningNode AFTER ────────────────────────────────────
messages[0]  HumanMessage: "Hey, plan me a trip"
messages[1]  AIMessage:    "G'day!..."
messages[2]  HumanMessage: "Melbourne to Sydney..."
messages[3]  AIMessage:    "Awesome!..."
messages[4]  AIMessage:    "One moment..." + tool_calls[5]
messages[5]  ToolMessage:  flight results
messages[6]  ToolMessage:  hotel results
messages[7]  ToolMessage:  activity results
messages[8]  ToolMessage:  weather results
messages[9]  ToolMessage:  events results
messages[10] AIMessage:    "Great, putting your itinerary together!"
                           tool_calls: [call_itinerary_agent]

── afterPlanning → 'planning_tools' (has tool_calls)

── planningToolsNode BEFORE ──────────────────────────────
(11 messages)

── planningToolsNode AFTER ───────────────────────────────
messages[0-10] (same as above)
messages[11] ToolMessage:  tool_call_id=tc_6 → full itinerary text

── edge: planning_tools → planning

── planningNode BEFORE ───────────────────────────────────
(12 messages — sees itinerary result)

── planningNode AFTER ────────────────────────────────────
messages[0-11] (same as above)
messages[12] AIMessage:    "Here's your complete Sydney itinerary!
                            DAY 1 - April 1...
                            DAY 2 - April 2...
                            DAY 3 - April 3..."
                           tool_calls: [] (none)

── afterPlanning → END (no tool_calls)
```

## LangGraph Key Concepts (Don't Forget This)

### `.invoke()` vs `.stream()`

| Method | Behaviour | Returns |
|--------|-----------|---------|
| `.invoke()` | Runs the **entire graph** from START to END as one blocking call. You get nothing until END. | Final state (all messages) |
| `.stream()` | Yields after **each node** completes. You can print/process intermediate results as the graph runs. | Chunks per node |

**Rule:** If you need the user to see anything before the graph finishes (e.g. "One moment..."), you MUST use `.stream()`. With `.invoke()`, intermediate messages exist in the array but you have no way to show them until the graph is done.

### How tool calls work in LangGraph

1. The LLM node (e.g. `planningNode`) returns a **single AIMessage** containing both text AND tool_calls together. They are NOT separate messages — they come in one response from the model API.

```
AIMessage {
  content: "One moment, searching for flights...",   ← text
  tool_calls: [{ name: "call_flight_agent", ... }],  ← tool calls
}
```

2. The router (`afterPlanning`) checks if that AIMessage has `tool_calls`. If yes → route to `ToolNode`. If no → route to `END`.

3. `ToolNode` executes the tool calls and appends `ToolMessage`s (one per call) to the messages array.

4. The edge sends it back to the LLM node, which now sees the tool results and decides what to do next (call more tools or return final text).

**The LLM node does NOT execute tools.** It only *requests* them via `tool_calls`. The actual execution happens in `ToolNode` — a separate node in the graph.

### Streaming + tool call text

When using `.stream({ streamMode: 'updates' })`:

```
Yield 1 → planningNode output:
  AIMessage("One moment...", tool_calls: [flight, hotel, ...])
  ↑ Print the text NOW — tools haven't run yet

Yield 2 → planningToolsNode output:
  [ToolMessage, ToolMessage, ToolMessage, ...]
  ↑ Skip printing — these are internal results

Yield 3 → planningNode output (2nd run):
  AIMessage("Putting it together!", tool_calls: [itinerary])
  ↑ Print the text — itinerary tool hasn't run yet

Yield 4 → planningToolsNode output:
  [ToolMessage with itinerary]
  ↑ Skip

Yield 5 → planningNode output (3rd run):
  AIMessage("Here's your itinerary! DAY 1...")
  ↑ Print — this is the final response, no tool_calls, graph ends
```

The user sees progress at each step instead of 60 seconds of silence.

### Content format gotcha (Gemini)

When Gemini returns text + tool_calls, `content` is an **array**, not a string:

```json
content: [
  { "type": "text", "text": "One moment..." },
  { "functionCall": { "name": "call_flight_agent", "args": {...} } }
]
```

When it returns just text (no tool calls), `content` is a **string**:

```
content: "Here's your itinerary! DAY 1..."
```

So when printing, always check: if `content` is a string, print it directly. If it's an array, extract only the `type: "text"` parts and skip `functionCall` entries. Otherwise you'll dump raw JSON to the user.

### Phase transitions happen mid-graph

A single `.invoke()` or `.stream()` call can span multiple phases. Example: user provides all trip details → gathering node sets `phase: 'planning'` → `afterGathering` routes to planning node → tools run → itinerary returned — all in ONE call. The graph doesn't stop between phases.
