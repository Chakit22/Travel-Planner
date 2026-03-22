import 'dotenv/config';
import { tool } from '@langchain/core/tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';

import { searchFlightsSerpApi } from '../tools/serpapi';
import { guardrails } from '../prompts/shared';

// ─── Flight Agent Prompt (Gemini 3 style: context → task → constraints) ─────

const flightPrompt = `CONTEXT:
You are a Flight Search Specialist. You search for flights using the search_flights tool.

TASK:
Parse the query for origin, destination, dates, travelers, and class. Convert city names to airport codes (NYC→JFK, Tokyo→NRT, Melbourne→MEL, Paris→CDG, Delhi→DEL, London→LHR, Bangkok→BKK, Bali→DPS, Sydney→SYD).

PREFERENCE MAPPING — use these filters instead of putting preferences in the query:
- "direct"/"nonstop" → stops: 1
- "max 1 stop" → stops: 2
- "under $X" → max_price: X
- "Qantas only" → include_airlines: "QF"
- "no budget airlines" → exclude_airlines: "JQ,TT" (Jetstar, Tiger)
- "Star Alliance" → include_airlines: "STAR_ALLIANCE"
- "with checked bag" → bags: 1
- "short flight"/"under 5 hours" → max_duration: 300
- "low emissions" → emissions: 1
- "X children" → children: X
- "infant" → infants_on_lap: 1 (or infants_in_seat: 1)

Call search_flights and return up to 5 options. If fewer than 5 results are available, return all of them.

OUTPUT:
**Top Flight Options:**
1. [Airline] - $[per_person_price] per person ($[total_price] total for [X] adults)
   - Flight: [flight_number]
   - Depart: [airport] [time] → Arrive: [airport] [time]
   - Duration: [X]h [Y]m, Stops: [direct/1 stop/etc]

**Price Insights:** Typical range $X–$Y, current level: [low/typical/high]
**Best Value:** [cheapest option]
**Total for [X] travelers:** $[total_price]

CONSTRAINTS:
- The "price" field in results is the TOTAL for ALL adults combined, not per person. Divide by adults for per-person price. The "note" field confirms this.
- "Total for X travelers" uses the price as-is — do NOT multiply again.
${guardrails}`;

// ─── Create the Flight Subagent ──────────────────────────────────────────────

const flightAgent = createReactAgent({
  llm: new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    temperature: 1.0,
  }),
  tools: [searchFlightsSerpApi],
  stateModifier: flightPrompt,
});

// ─── Export as Tool for Supervisor ───────────────────────────────────────────

export const callFlightAgent = tool(
  async ({ query }: { query: string }) => {
    // console.log(`\n  Flight Agent activated`);
    // console.log(`  Query: "${query}"`);

    const result = await flightAgent.invoke({
      messages: [new HumanMessage(query)],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    const content = typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

    // console.log(`  Flight Agent completed`);
    // console.log(`  Response:\n${content}`);
    // console.log('─'.repeat(60));

    return content;
  },
  {
    name: 'call_flight_agent',
    description: 'Search for flights between cities. Provide origin, destination, dates, and number of travelers.',
    schema: z.object({
      query: z.string().describe(
        'Flight search query. Example: "New York to Tokyo, April 10-15, 2 adults" or "LAX to Paris, departing May 5, returning May 12, 1 adult"',
      ),
    }),
  },
);
