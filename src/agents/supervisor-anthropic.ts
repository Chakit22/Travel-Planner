import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { tools, tool_map, USER_SCOPED_TOOLS, TRIP_SCOPED_TOOLS } from '../tools/anthropic-tools';
import { guardrails } from '../prompts/shared';
import { getUserMemory, formatMemoryForPrompt, type UserMemory } from '../tools/memory';

// ─── DATE HELPER ────────────────────────────────────────────────────────────

function getDateContext() {
  const now = new Date();
  return {
    today: now.toISOString().split('T')[0],
    dayName: now.toLocaleDateString('en-US', { weekday: 'long' }),
    monthName: now.toLocaleDateString('en-US', { month: 'long' }),
    day: now.getDate(),
    year: now.getFullYear(),
    time: now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

const userOrigin = process.env.USER_DEFAULT_ORIGIN || '';

export type SupervisorMode = 'planner' | 'companion';

export interface Geolocation {
  lat: number;
  lng: number;
  accuracy_m?: number;
}

interface BuildPromptArgs {
  memory: UserMemory;
  mode: SupervisorMode;
  geolocation?: Geolocation | null;
}

// ─── PROMPT ─────────────────────────────────────────────────────────────────

const PLANNER_TASK = `TASK (PLANNER MODE):
You operate in two stages. Complete stage 1 before stage 2.

Stage 1 — Gather trip details (one question at a time):

Required:
1. Destination and departure city
2. Exact departure date and return date (YYYY-MM-DD)
3. Number of travelers

Optional (ask all in one message after required info is collected):
4. Budget
5. Hotel amenities (e.g. Free Wi-Fi, Pool, Spa, Free breakfast, Pet-friendly, etc.)
6. Hotel star rating (2-star, 3-star, 4-star, 5-star)
7. Property type (e.g. Boutique hotels, Resorts, Bed and breakfasts, Hostels, etc.)
Tell the user they can say "no preference" to skip any optional item.

If USER MEMORY contains relevant past trips or stored preferences, propose them up-front: "You've gone for boutique + 4-star last time. Same again, or change it up?" Skip questions the memory already answers unless the user contradicts it.

Do NOT call any of the search tools during Stage 1.

As soon as items 1–3 are confirmed (destination, both dates, traveler count), call update_trip_metadata. Call it again any time the user changes one of those values mid-conversation, or when budget becomes known.

Once items 1–3 are confirmed, move to Stage 2.

Stage 2 — Search and plan:
Run all searches in your first turn, then present results.
- search_flights
- search_hotels
- search_places for things to do
- search_weather for the destination
- search_events for the destination and travel dates

After results return, show top 5 flights and top 5 hotels in a clean numbered list.
For each flight, list BOTH legs:
  Outbound: <airline> <flight_number> · <depart.id> <depart.time> → <arrive.id> <arrive.time> · <stops> stops · <duration_min>m
  Return:   <airline> <flight_number> · <depart.id> <depart.time> → <arrive.id> <arrive.time> · <stops> stops · <duration_min>m
  Total: <price> AUD round-trip · <total_duration_min>m

Ask the user to pick. STOP.
Once the user picks, call compose_itinerary and write a day-by-day itinerary in prose.

ITINERARY-WRITING RULES (after compose_itinerary):
- Use the SELECTED flight's outbound depart time + arrival time on the arrival day.
- Use the SELECTED flight's RETURN depart time + arrival time on the departure day.
- NEVER write "times TBD", "based on schedule", "typically mid-morning", or anything that suggests you don't know. The data is in the user's selection — copy the exact times from there.
- If a time is genuinely missing from the selection, ASK the user instead of guessing.`;

const COMPANION_TASK = `TASK (COMPANION MODE):
The user is currently traveling and standing at the GPS coordinates above. They want suggestions for what to do RIGHT NOW.

Workflow:
1. Read the user's question to infer what they want (food, attraction, café, etc.) and how much time they have.
2. Call find_nearby_places with their lat/lng, an appropriate category, and radius_m suited to time available (1500m default ≈ 15 min walk; 3000m for "I have all afternoon").
3. From the raw list returned, you MUST:
   - EXCLUDE anything matching the user's stored dislikes.
   - BOOST anything matching the user's stored likes (cuisine, vibe, hotel_type tokens that map to nearby place tags).
   - PRIORITISE places where is_open_now === true. DEPRIORITISE is_open_now === false. For is_open_now === null (unknown), include them but mention "hours unknown" so the user can check.
   - When relevant, mention closing time (closes_at_iso) for currently-open places, or next opening (opens_at_iso) for closed ones — convert ISO timestamps to local-friendly times like "open until 10pm" or "opens 7am tomorrow".
   - Sort remaining by walking distance.
4. Reply with the TOP 3 places in a numbered list. For each, include:
   - Name
   - 1-line reason it matches THIS user (cite the like that triggered it, if any)
   - Distance in metres / minutes (assume 80m/min walking)
   - The cuisine/category if known
   - Inline taste-capture markdown so they can teach you:
       [👍 Save](pref:cuisine:ITEM:like) [👎 Avoid](pref:cuisine:ITEM:dislike)

5. End with "Want me to dig deeper on one of these, or pull a different category?"

Never call search_flights / search_hotels in companion mode.
If find_nearby_places fails, apologize naturally and ask the user to try again in a moment.`;

function buildSystemPrompt({ memory, mode, geolocation }: BuildPromptArgs): string {
  const { dayName, monthName, day, year, today, time } = getDateContext();
  const memoryBlock = formatMemoryForPrompt(memory);

  const locationBlock = geolocation
    ? `USER LOCATION (live GPS): ${geolocation.lat.toFixed(5)}, ${geolocation.lng.toFixed(5)}${geolocation.accuracy_m ? ` (±${Math.round(geolocation.accuracy_m)}m)` : ''}.`
    : 'USER LOCATION: not shared.';

  const taskBlock = mode === 'companion' ? COMPANION_TASK : PLANNER_TASK;

  return `CONTEXT:
You are Atlas, a friendly travel companion that walks with users and remembers them.
Today: ${dayName}, ${monthName} ${day}, ${year} (${today}). Current time: ${time}.
User's default origin: ${userOrigin || 'Not set — ask user'}.
AIRPORT CODES: NYC→JFK, Tokyo→NRT, Melbourne→MEL, Paris→CDG, Delhi→DEL, London→LHR, Bangkok→BKK, Bali→DPS, Sydney→SYD.

${memoryBlock}

${locationBlock}

ACTIVE MODE: ${mode.toUpperCase()}

${taskBlock}

OUTPUT:
Warm, conversational tone. Reference the user's past trips and preferences naturally on the first message of a new session ("Welcome back. Last time you went to Bali..."). Never list memory back as a database dump.

PREFERENCE CAPTURE:
- Whenever the user expresses a like or dislike in chat ("I love seafood", "hostels are awful", "boutique is my style", "I always fly Qantas", "never Jetstar again"), call save_user_preference. One call per distinct preference. Use category buckets: cuisine, hotel_amenity, hotel_type, airline, flight_class, vibe, transport, activity, climate, budget.
- When listing options to the user (flights, hotels, places, restaurants), append inline taste-capture markdown after each item using EXACTLY this format on its own line:
    [👍 Save](pref:CATEGORY:ITEM:like) [👎 Avoid](pref:CATEGORY:ITEM:dislike)
  Replace CATEGORY and ITEM with concrete values. The frontend turns these tokens into clickable buttons. Use them sparingly — 1 set per item, not for itineraries.
  For flights, use category=airline and item=<airline name> (e.g. pref:airline:Qantas:like).
- After delivering a final itinerary, ask "What did you love most?" and save the response.

PREFERENCE-DRIVEN SEARCH (apply on EVERY search call):
- BEFORE calling search_flights:
    * Look at USER MEMORY likes for category=airline. Convert airline names to IATA codes and pass them as include_airlines (comma-separated, e.g. "QF,SQ").
    * Look at USER MEMORY dislikes for category=airline. Pass them as exclude_airlines.
    * Look at USER MEMORY for category=flight_class. If a likes entry exists (Economy / Premium economy / Business / First), pass it as travel_class.
- BEFORE calling search_hotels:
    * Look at USER MEMORY likes for category=hotel_type. Pass them as property_types (e.g. "Boutique hotels,Resorts").
    * Look at USER MEMORY likes for category=hotel_amenity. Pass them as amenities.
- AFTER any search returns:
    * Drop or deprioritise items matching dislikes. State the reason briefly ("skipped Jetstar — you've avoided it before").
    * Push items matching likes to the top. State the reason briefly ("Qantas first because you've flown them before").
    * If memory is empty for a category, behave as a normal first-time user — no filtering.
- IATA mapping for common airlines: Qantas→QF, Jetstar→JQ, Virgin Australia→VA, Singapore Airlines→SQ, Emirates→EK, Cathay Pacific→CX, Air NZ→NZ, ANA→NH, JAL→JL, Thai Airways→TG, Vietnam Airlines→VN.

CONSTRAINTS:
- Never invent past trips or preferences that aren't in USER MEMORY. If memory is empty, treat as a new user.
- Never expose raw memory keys, IDs, or schema. Speak naturally.
- Never auto-pick options. Wait for user selection before compose_itinerary.
- For weather, always call search_weather. Never answer from memory.
${guardrails}`;
}

// ─── AGENT ───────────────────────────────────────────────────────────────────

export interface SupervisorOptions {
  userId?: string;
  tripId?: string;
  mode?: SupervisorMode;
  geolocation?: Geolocation | null;
}

export class SupervisorAgent {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  public messages: Anthropic.MessageParam[];
  private userId: string;
  public tripId: string;
  private mode: SupervisorMode;
  private geolocation: Geolocation | null;
  private memory: UserMemory | null = null;
  private memoryWarmed = false;

  constructor(opts: SupervisorOptions = {}) {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = 'claude-haiku-4-5-20251001';
    this.maxTokens = 4096;
    this.messages = [];
    this.userId = opts.userId ?? '';
    this.tripId = opts.tripId ?? '';
    this.mode = opts.mode ?? 'planner';
    this.geolocation = opts.geolocation ?? null;
  }

  setMode(mode: SupervisorMode) {
    this.mode = mode;
  }

  setGeolocation(geo: Geolocation | null) {
    this.geolocation = geo;
  }

  /** Force a memory refresh on next turn. Call after preferences are written via API. */
  invalidateMemory() {
    this.memoryWarmed = false;
  }

  private async warmMemory(): Promise<UserMemory> {
    if (this.memoryWarmed && this.memory) return this.memory;
    this.memory = this.userId
      ? await getUserMemory(this.userId)
      : { profile: null, pastTrips: [], likes: [], dislikes: [] };
    this.memoryWarmed = true;
    return this.memory;
  }

  async chat(userInput: string): Promise<{ reply: string; toolCalls: string[] }> {
    let memory = await this.warmMemory();
    let system = buildSystemPrompt({ memory, mode: this.mode, geolocation: this.geolocation });

    this.messages.push({ role: 'user', content: userInput });
    const toolCalls: string[] = [];

    let response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system,
      tools,
      messages: this.messages,
    });

    this.messages.push({ role: 'assistant', content: response.content });

    while (response.stop_reason === 'tool_use') {
      const tool_uses = response.content.filter(
        (b: any): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );

      const tool_results: any[] = [];
      for (const tool_use of tool_uses) {
        toolCalls.push(tool_use.name);
        const handler = tool_map[tool_use.name];
        let input: any = tool_use.input;

        if (USER_SCOPED_TOOLS.has(tool_use.name)) {
          input = { ...input, user_id: this.userId };
        }
        if (TRIP_SCOPED_TOOLS.has(tool_use.name)) {
          input = { ...input, trip_id: this.tripId };
        }

        console.error(`[tool] ${tool_use.name}(${JSON.stringify(input)})`);
        const result = handler ? await handler(input) : `Unknown tool: ${tool_use.name}`;

        if (tool_use.name === 'save_user_preference') {
          this.memoryWarmed = false;
        }

        tool_results.push({
          type: 'tool_result',
          tool_use_id: tool_use.id,
          content: result,
        });
      }

      this.messages.push({ role: 'user', content: tool_results });

      if (!this.memoryWarmed) {
        memory = await this.warmMemory();
        system = buildSystemPrompt({ memory, mode: this.mode, geolocation: this.geolocation });
      }

      response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system,
        tools,
        messages: this.messages,
      });

      this.messages.push({ role: 'assistant', content: response.content });
    }

    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }
    return { reply: text, toolCalls };
  }

  /**
   * Streaming variant of chat(). Emits granular events:
   *   - tool_start { name }   when Claude begins a tool_use block (input still streaming)
   *   - tool_done  { name }   after the tool handler resolves
   *   - text_delta { text }   on each text token as Claude composes its reply
   *   - done {}               when the turn fully ends (stop_reason !== 'tool_use')
   *   - error { message }     on failure
   */
  async chatStream(
    userInput: string,
    onEvent: (event: SupervisorStreamEvent) => void,
  ): Promise<void> {
    let memory = await this.warmMemory();
    let system = buildSystemPrompt({ memory, mode: this.mode, geolocation: this.geolocation });

    this.messages.push({ role: 'user', content: userInput });

    while (true) {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system,
        tools,
        messages: this.messages,
      });

      // Fire tool_start the moment Claude announces a tool block — input not yet known,
      // but the name is, which is all the UI needs.
      stream.on('streamEvent', (event: any) => {
        if (
          event?.type === 'content_block_start' &&
          event.content_block?.type === 'tool_use'
        ) {
          onEvent({ type: 'tool_start', name: event.content_block.name });
        }
      });

      // Token-by-token text streaming.
      stream.on('text', (delta: string) => {
        if (delta) onEvent({ type: 'text_delta', text: delta });
      });

      const finalMessage = await stream.finalMessage();
      this.messages.push({ role: 'assistant', content: finalMessage.content });

      if (finalMessage.stop_reason !== 'tool_use') {
        onEvent({ type: 'done' });
        return;
      }

      // Execute every tool the model asked for, emit tool_done after each.
      const tool_uses = finalMessage.content.filter(
        (b: any): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      const tool_results: any[] = [];
      for (const tool_use of tool_uses) {
        const handler = tool_map[tool_use.name];
        let input: any = tool_use.input;
        if (USER_SCOPED_TOOLS.has(tool_use.name)) {
          input = { ...input, user_id: this.userId };
        }
        if (TRIP_SCOPED_TOOLS.has(tool_use.name)) {
          input = { ...input, trip_id: this.tripId };
        }
        console.error(`[tool] ${tool_use.name}(${JSON.stringify(input)})`);
        const result = handler ? await handler(input) : `Unknown tool: ${tool_use.name}`;
        if (tool_use.name === 'save_user_preference') {
          this.memoryWarmed = false;
        }
        onEvent({ type: 'tool_done', name: tool_use.name });
        tool_results.push({
          type: 'tool_result',
          tool_use_id: tool_use.id,
          content: result,
        });
      }

      this.messages.push({ role: 'user', content: tool_results });

      if (!this.memoryWarmed) {
        memory = await this.warmMemory();
        system = buildSystemPrompt({ memory, mode: this.mode, geolocation: this.geolocation });
      }
      // loop into next turn with refreshed system prompt
    }
  }
}

export type SupervisorStreamEvent =
  | { type: 'tool_start'; name: string }
  | { type: 'tool_done'; name: string }
  | { type: 'text_delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };
