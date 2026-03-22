import 'dotenv/config';
import { tool } from '@langchain/core/tools';
import { getJson } from 'serpapi';
import { z } from 'zod';

const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;

export const searchEvents = tool(
  async ({ query }: { query: string }) => {
    try {
      const data = await getJson({
        engine: 'google_events',
        q: query,
        hl: 'en',
        api_key: SERPAPI_API_KEY,
      });

      const events = (data.events_results || []).slice(0, 10).map((e: any) => ({
        title: e.title,
        date: e.date?.when,
        address: e.address?.join(', '),
        description: e.description,
        venue: e.venue?.name,
        link: e.link,
      }));

      if (events.length === 0) {
        return `No events found for "${query}".`;
      }

      return JSON.stringify({ events, query }, null, 2);
    } catch (err: any) {
      return `Events search failed: ${err.message}`;
    }
  },
  {
    name: 'search_events',
    description:
      'Search for events, festivals, concerts, markets, and local happenings in a city. Returns event names, dates, venues, and descriptions.',
    schema: z.object({
      query: z.string().describe(
        'Events search query, e.g. "events in Sydney April 2026", "festivals in Tokyo this week", "concerts in Melbourne"',
      ),
    }),
  },
);
