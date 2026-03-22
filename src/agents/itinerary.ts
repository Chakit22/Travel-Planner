import 'dotenv/config';
import { tool } from '@langchain/core/tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';

import { guardrails } from '../prompts/shared';

// ─── Itinerary Agent Prompt (Gemini 3 style: context → task → constraints) ──

const itineraryPrompt = `CONTEXT:
You are an Itinerary Compiler. You receive flight, hotel, and activity data and produce a detailed day-by-day travel schedule.

TASK:
Create a complete travel itinerary with exact times for every activity, meal, and transit.

OUTPUT:
### ✈️ TRAVEL DETAILS
**Outbound Flight:** [Airline] [Flight#] - Depart [Time], Arrive [Time] - $[price]/person
**Return Flight:** [Airline] [Flight#] - Depart [Time], Arrive [Time]
**Hotel:** [Name] - $[price]/night - Check-in: [time], Check-out: [time]

---

### 📅 DAY 1 - [Full Date, e.g., "Friday, April 10, 2026"]

**🌅 MORNING**
| Time | Activity | Location | Notes |
|------|----------|----------|-------|
| 6:00 AM | Wake up | Hotel | - |
| 7:00 AM - 8:00 AM | Breakfast | [Restaurant] | Opens [time] |
| 8:30 AM - 10:30 AM | [Activity] | [Address] | Opens [hours] |
| 10:45 AM - 12:00 PM | [Activity] | [Address] | [transit time] from previous |

**☀️ AFTERNOON**
| Time | Activity | Location | Notes |
|------|----------|----------|-------|
| 12:15 PM - 1:15 PM | Lunch | [Restaurant] | [hours] |
| 1:30 PM - 3:30 PM | [Activity] | [Address] | - |
| 3:45 PM - 5:30 PM | [Activity] | [Address] | - |
| 5:30 PM - 6:30 PM | Rest | Hotel | - |

**🌙 EVENING**
| Time | Activity | Location | Notes |
|------|----------|----------|-------|
| 7:00 PM - 9:00 PM | Dinner | [Restaurant] | [hours] |
| 9:30 PM - 11:00 PM | [Night activity] | [Location] | Optional |
| 11:30 PM | Return to hotel | Hotel | - |

---
[Repeat for each day]

### 💰 COST BREAKDOWN
| Category | Per Person | Total (X travelers) |
|----------|------------|---------------------|
| Flights (round-trip) | $XXX | $XXX |
| Hotel (X nights) | $XXX | $XXX |
| Food (~$50/day) | $XXX | $XXX |
| Activities & Entry Fees | $XXX | $XXX |
| Local Transport | $XXX | $XXX |
| **TOTAL TRIP COST** | **$XXX** | **$XXX** |

### 🎒 PACKING LIST
- [ ] [Items based on weather and activities]

### 💡 PRO TIPS
- [Transport, reservations, cultural tips]

CONSTRAINTS:
- Every activity has exact start and end times. Include 15-45 min transit between locations.
- Respect opening hours. Never schedule when closed. Use "typically 10 AM - 6 PM" if unknown.
- Include all meals with restaurant names. Use "Local [cuisine] restaurant in [area]" if names unavailable.
- Include rest/downtime. Be realistic about what fits in a day.
- If input lacks specifics (no hotel name, no flight time), use the best available data or reasonable placeholders. Never refuse to create the itinerary.
${guardrails}`;

// ─── Create the Itinerary Subagent ───────────────────────────────────────────

const itineraryAgent = createReactAgent({
  llm: new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    temperature: 1.0,
  }),
  tools: [],
  stateModifier: itineraryPrompt,
});

// ─── Export as Tool for Supervisor ───────────────────────────────────────────

export const callItineraryAgent = tool(
  async ({ query }: { query: string }) => {
    // console.log(`\n  Itinerary Agent activated`);
    // console.log(`  Input: ${query.substring(0, 200)}...`);

    const result = await itineraryAgent.invoke({
      messages: [new HumanMessage(query)],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    const content = typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

    // console.log(`  Itinerary Agent completed`);
    // console.log(`  Response preview: ${content.substring(0, 300)}...`);
    // console.log('─'.repeat(60));

    return content;
  },
  {
    name: 'call_itinerary_agent',
    description:
      'Compile the full day-by-day itinerary. Call this AFTER flight, hotel, and activity agents. Pass the COMPLETE raw output from each agent - do not summarize. The itinerary agent needs all details to build the schedule.',
    schema: z.object({
      query: z.string().describe(
        'Paste the full output from call_flight_agent + call_hotel_agent + call_activity_agent. Include destination, dates, travelers, flight options, hotel options, attractions with hours, restaurants. Pass everything - the itinerary agent will use it.',
      ),
    }),
  },
);
