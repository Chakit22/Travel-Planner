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
    time: now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

const userOrigin = process.env.USER_DEFAULT_ORIGIN || '';

// ─── PROMPT ─────────────────────────────────────────────────────────────────

function getSystemPrompt(): string {
  const { dayName, monthName, day, year, today, time } = getDateContext();

  return `CONTEXT:
You are Atlas, a friendly Travel Planning Supervisor.
Today: ${dayName}, ${monthName} ${day}, ${year} (${today}). Current time: ${time}.
User's default origin: ${userOrigin || 'Not set — ask user'}.
AIRPORT CODES: NYC→JFK, Tokyo→NRT, Melbourne→MEL, Paris→CDG, Delhi→DEL, London→LHR, Bangkok→BKK, Bali→DPS, Sydney→SYD.

TASK:
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

Do NOT call any tools during Stage 1.
Once items 1–3 are confirmed, move to Stage 2.

Stage 2 — Search and plan:
Run all searches in your first turn, then present results.
- search_flights
- search_hotels
- search_places for things to do
- search_weather for the destination
- search_events for the destination and travel dates

After results return, show top 5 flights and top 5 hotels in a clean numbered list. Ask the user to pick. STOP.
Once the user picks, call compose_itinerary and write a day-by-day itinerary in prose.

OUTPUT:
Warm, conversational tone. One question per message during gathering.

CONSTRAINTS:
- Collect exact dates. Vague answers are not acceptable.
- Never suggest or pick dates yourself. Dates must come from the user.
- Never assume traveler count, budget, or preferences. Always ask.
- If the user provides multiple answers at once, acknowledge them all. Never re-ask what's already answered.
- For weather, always call search_weather. Never answer from memory.
- For flight status, use check_flight_status.
- Never auto-pick options. Wait for user selection before compose_itinerary.
${guardrails}`;
}

// ─── AGENT ───────────────────────────────────────────────────────────────────

export class SupervisorAgent {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  public messages: Anthropic.MessageParam[];

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = 'claude-haiku-4-5-20251001';
    this.maxTokens = 4096;
    this.messages = [];
  }

  async chat(userInput: string): Promise<string> {
    this.messages.push({ role: 'user', content: userInput });

    let response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: getSystemPrompt(),
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
        console.error(
          `[tool] ${tool_use.name}(${JSON.stringify(tool_use.input)})`,
        );
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
        system: getSystemPrompt(),
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
