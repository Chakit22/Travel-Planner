import 'dotenv/config';
import { tool } from '@langchain/core/tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { z } from 'zod';

import { searchHotelsSerpApi } from '../tools/serpapi';
import { guardrails } from '../prompts/shared';

// ─── Hotel Agent Prompt (Gemini 3 style: context → task → constraints) ──────

const hotelPrompt = `CONTEXT:
You are a Hotel Search Specialist. You search for hotels using the search_hotels tool.

TASK:
Parse the query for destination, dates, guest count, and preferences. Map user preferences to specific filter parameters before calling search_hotels.

PREFERENCE MAPPING — use these filters instead of putting preferences in the query string:
- "pet-friendly" → amenities: "19"
- "pool" → amenities: "6"  (or "4" indoor, "5" outdoor)
- "free breakfast" → amenities: "9"
- "free parking" → amenities: "1"
- "spa" → amenities: "10"
- "gym"/"fitness" → amenities: "7"
- "beach" → amenities: "11"
- "restaurant" → amenities: "8"
- "bar" → amenities: "15"
- "room service" → amenities: "22"
- "wifi" → amenities: "35"
- "wheelchair accessible" → amenities: "53"
- "EV charger" → amenities: "61"
- "all-inclusive" → amenities: "52"
- "child-friendly"/"kids" → amenities: "12"
- Combine multiple: amenities: "9,6,19" (free breakfast + pool + pet-friendly)

- "resort" → property_types: "17"
- "boutique" → property_types: "13"
- "hostel" → property_types: "14"
- "B&B"/"bed and breakfast" → property_types: "19"
- "apartment" → property_types: "21"
- "spa hotel" → property_types: "18"
- "motel" → property_types: "16"
- "beach hotel" → property_types: "12"
- "ryokan" → property_types: "24"

- "under $X/night" → max_price: X
- "budget $X-$Y" → min_price: X, max_price: Y
- "highly rated"/"top rated" → rating: 8 (4.0+) or rating: 9 (4.5+)
- "free cancellation" → free_cancellation: true
- "eco-friendly" → eco_certified: true
- "deals"/"offers" → special_offers: true
- "vacation rental"/"Airbnb style" → vacation_rentals: true

Keep the query string simple (just location): "hotels in Tokyo" or "hotels in Shibuya, Tokyo".
Put ALL preferences into the typed filter parameters, NOT into the query string.

Call search_hotels and return up to 5 options. If fewer than 5 results are available, return all of them.

OUTPUT:
**Top Hotel Options:**
1. [Hotel Name] ⭐ [rating] ([reviews] reviews) - [hotel_class]-star
   - Rate: $[rate_per_night]/night per room (Total: $[total_rate] for [X] nights)
   - Check-in: [time], Check-out: [time]
   - Amenities: [top amenities]
   - Near: [nearby places]

**Best Value:** [cheapest with good rating]
**Highest Rated:** [best rating]

CONSTRAINTS:
- Prices from Google Hotels are per ROOM, not per person. rate_per_night = room rate per night. total_rate = total for entire stay. A standard room fits 2 adults. Do NOT divide by guests. The "note" field confirms this.
- Always list specific hotel names and prices from results.
- ALWAYS present whatever results the tool returns, even if only 1 or 2. Never say you couldn't find results when the tool returned data.
${guardrails}`;

// ─── Create the Hotel Subagent ───────────────────────────────────────────────

const hotelAgent = createReactAgent({
  llm: new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    temperature: 1.0,
  }),
  tools: [searchHotelsSerpApi],
  stateModifier: hotelPrompt,
});

// ─── Export as Tool for Supervisor ───────────────────────────────────────────

export const callHotelAgent = tool(
  async ({ query }: { query: string }) => {
    // console.log(`\n  Hotel Agent activated`);
    // console.log(`  Query: "${query}"`);

    const result = await hotelAgent.invoke({
      messages: [new HumanMessage(query)],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    const content = typeof lastMessage.content === 'string'
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

    // console.log(`  Hotel Agent completed`);
    // console.log(`  Response:\n${content}`);
    // console.log('─'.repeat(60));

    return content;
  },
  {
    name: 'call_hotel_agent',
    description: 'Search for hotels in a destination. Provide destination, check-in/out dates, and number of guests.',
    schema: z.object({
      query: z.string().describe(
        'Hotel search query. Example: "Hotels in Tokyo, April 10-15, 2 guests" or "Luxury hotels in Paris near Eiffel Tower, May 5-12, 1 guest"',
      ),
    }),
  },
);
