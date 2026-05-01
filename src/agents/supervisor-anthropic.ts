import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { tools, tool_map } from '../tools/anthropic-tools';
import { guardrails } from '../prompts/shared';

// ─── DATE HELPER ────────────────────────────────────────────────────────────

function getDateContext() {
  const now = new Date();
  return {
    today: now.toISOString().split('T')[0],
    dayName: now.toLocaleDateString('en-US', { weekday: 'long' }),
    monthName: now.toLocaleDateString('en-US', { month: 'long' }),
    day: now.getDate(),
    year: now.getFullYear(),
    time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  };
}

const userOrigin = process.env.USER_DEFAULT_ORIGIN || '';

// ─── PROMPTS ────────────────────────────────────────────────────────────────

function getGatheringPrompt(): string {
  const { dayName, monthName, day, year, today, time } = getDateContext();
  return `CONTEXT:
You are a friendly Travel Planning Supervisor collecting trip details before searching.
Today: ${dayName}, ${monthName} ${day}, ${year} (${today}). Current time: ${time}.
User's default origin: ${userOrigin || 'Not set — ask user'}.

TASK:
Collect from the user, one question at a time:

Required:
1. Destination and departure city
2. Exact departure date and exact return date (YYYY-MM-DD)
3. Number of travelers

Optional (ask once):
4. Budget and preferences

Once you have items 1–3, summarize and end with [READY_TO_PLAN].

OUTPUT:
Warm, conversational tone. One question per message.

CONSTRAINTS:
- YOU MUST collect exact dates. Vague answers are NOT acceptable. Nudge them to pin down specific dates.
- YOU MUST NEVER suggest, propose, or pick dates yourself. Dates must come from the user.
- YOU MUST NEVER assume traveler count, budget, or preferences. Always ask.
- If user provides multiple answers at once, acknowledge them all. Never re-ask what's already answered.
- When all required info is confirmed, end with [READY_TO_PLAN].
${guardrails}`;
}

function getPlanningPrompt(): string {
  const { dayName, monthName, day, year, today, time } = getDateContext();
  return `CONTEXT:
You are a Travel Planning Supervisor. Trip details are confirmed in conversation history.
Today: ${dayName}, ${monthName} ${day}, ${year} (${today}). Current time: ${time}. Default origin: ${userOrigin || 'Not set'}.

AIRPORT CODES: NYC→JFK, Tokyo→NRT, Melbourne→MEL, Paris→CDG, Delhi→DEL, London→LHR, Bangkok→BKK, Bali→DPS, Sydney→SYD.

TASK:
Phase A — Search (run all 5 in your first turn):
1. search_flights with origin, destination, dates, adults
2. search_hotels with city, check_in, check_out, adults
3. search_places with "things to do in {destination}"
4. search_weather with destination city
5. search_events with "{destination} {trip month} {trip year}"

Phase B — Present (after results come back):
Show top 5 flights and top 5 hotels in a clean numbered list with prices, ratings, key details.
Ask the user to pick a flight and a hotel. STOP. Do NOT call compose_itinerary yet.

Phase C — Compose (after user picks):
Call compose_itinerary with selected_flight, selected_hotel, activities, weather, events.
Then write a day-by-day itinerary in prose using the JSON it returns.

PREFERENCE MAPPING for search_flights:
- "direct"/"nonstop" → stops: 1
- "max 1 stop" → stops: 2
- "under $X" → max_price: X

OUTPUT:
- Phase B: clean numbered list, ask user to pick.
- Phase C: full day-by-day itinerary in prose.

CONSTRAINTS:
- For weather questions, ALWAYS call search_weather. Never answer from memory.
- For flight status, use check_flight_status with IATA code.
- Don't auto-pick options. Wait for user selection before compose_itinerary.
${guardrails}`;
}

// ─── AGENT (mirrors ai-agent/calculator.py pattern) ─────────────────────────

export class SupervisorAgent {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  public messages: Anthropic.MessageParam[];
  public phase: 'gathering' | 'planning';

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = 'claude-haiku-4-5-20251001';
    this.maxTokens = 4096;
    this.messages = [];
    this.phase = 'gathering';
  }

  async chat(userInput: string): Promise<string> {
    this.messages.push({ role: 'user', content: userInput });

    if (this.phase === 'gathering') {
      return this.runGathering();
    }
    return this.runPlanning();
  }

  // ─── GATHERING — no tools, watch for [READY_TO_PLAN] ──────────────────────
  private async runGathering(): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: getGatheringPrompt(),
      messages: this.messages,
    });

    this.messages.push({ role: 'assistant', content: res.content });

    let text = '';
    for (const block of res.content) {
      if (block.type === 'text') text += block.text;
    }

    if (text.includes('[READY_TO_PLAN]')) {
      text = text.replace('[READY_TO_PLAN]', '').trim();
      this.phase = 'planning';
    }

    return text;
  }

  // ─── PLANNING — tool-use loop ─────────────────────────────────────────────
  private async runPlanning(): Promise<string> {
    let response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: getPlanningPrompt(),
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
        console.error(`[tool] ${tool_use.name}(${JSON.stringify(tool_use.input)})`);
        const handler = tool_map[tool_use.name];
        const result = handler
          ? await handler(tool_use.input)
          : `Unknown tool: ${tool_use.name}`;
        tool_results.push({
          type: 'tool_result',
          tool_use_id: tool_use.id,
          content: result,
        });
      }

      this.messages.push({ role: 'user', content: tool_results });

      response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: getPlanningPrompt(),
        tools,
        messages: this.messages,
      });

      this.messages.push({ role: 'assistant', content: response.content });
    }

    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') text += block.text;
    }
    return text;
  }
}
