import 'dotenv/config';
import { tool } from '@langchain/core/tools';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

import { searchPlaces, searchRestaurants } from '../tools/serper';
import { guardrails } from '../prompts/shared';

// ─── Single combined search: places + restaurants in parallel ────────────────

async function searchActivities(destination: string, preferences: string) {
  const placesQuery = `best attractions things to do in ${destination} opening hours${preferences ? ` ${preferences}` : ''}`;
  const restaurantsQuery = `best restaurants in ${destination} opening hours${preferences ? ` ${preferences}` : ''}`;

  const [placesResult, restaurantsResult] = await Promise.all([
    searchPlaces.invoke({ query: placesQuery }),
    searchRestaurants.invoke({ query: restaurantsQuery }),
  ]);

  return { places: placesResult, restaurants: restaurantsResult };
}

// ─── Activity Agent: single LLM call to format results ──────────────────────

const activityModel = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  temperature: 1.0,
});

const activityPrompt = `CONTEXT:
You are an Activities & Dining Specialist. You will receive raw search results for attractions and restaurants.

TASK:
Format the raw data into a clean, useful summary for the traveler.

OUTPUT:
**Top Attractions:**
1. [Name] ⭐ [rating] - [type]
   - Hours: [opening - closing]
   - [Brief description]

**Recommended Restaurants:**
1. [Name] ⭐ [rating] - [cuisine type]
   - Hours: [opening - closing]
   - Price: [$ level]

**Local Tips:**
- [Transport tips based on locations]
- [Cultural notes]

CONSTRAINTS:
- Only include places and restaurants from the provided data. Do not invent any.
- If opening hours are missing for a place, write "Hours: Check website".
${guardrails}`;

// ─── Export as Tool for Supervisor ───────────────────────────────────────────

export const callActivityAgent = tool(
  async ({ query, destination, preferences }: { query: string; destination: string; preferences?: string }) => {
    const { places, restaurants } = await searchActivities(destination, preferences || '');

    const result = await activityModel.invoke([
      new SystemMessage(activityPrompt),
      new HumanMessage(
        `Query: ${query}\n\n--- PLACES DATA ---\n${places}\n\n--- RESTAURANTS DATA ---\n${restaurants}`,
      ),
    ]);

    const content = typeof result.content === 'string'
      ? result.content
      : JSON.stringify(result.content);

    return content;
  },
  {
    name: 'call_activity_agent',
    description: 'Find attractions, restaurants, and local tips for a destination. Provide the destination and any preferences.',
    schema: z.object({
      query: z.string().describe(
        'Full context for the activity search. Example: "Things to do and eat in Tokyo, interested in art and ramen"',
      ),
      destination: z.string().describe(
        'Destination city name. Example: "Sydney", "Tokyo", "Paris"',
      ),
      preferences: z.string().optional().describe(
        'Optional preferences like "vegetarian food", "nightlife", "museums", "adventure sports"',
      ),
    }),
  },
);
