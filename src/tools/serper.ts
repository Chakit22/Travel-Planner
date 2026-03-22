import { tool } from '@langchain/core/tools';
import z from 'zod';

const SERPER_API_KEY = process.env.SERPER_API_KEY;

if (!SERPER_API_KEY) {
  console.error(
    '❌ Missing SERPER_API_KEY in .env\n' +
      '   Sign up free at: https://serper.dev\n' +
      '   Then add your API key to travel-planner/.env',
  );
  process.exit(1);
}

// ─── Serper API helper ──────────────────────────────────────────────────────────

async function serperRequest(
  endpoint: 'search' | 'places',
  body: Record<string, any>,
): Promise<any> {
  const response = await fetch(`https://google.serper.dev/${endpoint}`, {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Serper API error ${response.status}: ${text}`);
  }

  return response.json();
}

// ─── TOOLS ──────────────────────────────────────────────────────────────────────

export const searchFlights = tool(
  async ({
    origin,
    destination,
    departDate,
    returnDate,
    adults,
  }: {
    origin: string;
    destination: string;
    departDate: string;
    returnDate?: string;
    adults: number;
  }) => {
    const returnPart = returnDate ? ` return ${returnDate}` : ' one way';
    // console.log(
    //   `\n  ✈️  Searching flights: ${origin} → ${destination}, depart ${departDate}${returnPart}, ${adults} adults`,
    // );

    try {
      const query = returnDate
        ? `flights from ${origin} to ${destination} on ${departDate} return ${returnDate} ${adults} adults`
        : `flights from ${origin} to ${destination} on ${departDate} one way ${adults} adults`;

      const data = await serperRequest('search', {
        q: query,
        num: 10,
      });

      const results: any[] = [];

      if (data.knowledgeGraph) {
        results.push({
          source: 'knowledgeGraph',
          ...data.knowledgeGraph,
        });
      }

      if (data.answerBox) {
        results.push({
          source: 'answerBox',
          ...data.answerBox,
        });
      }

      const organic = (data.organic || []).slice(0, 8).map((r: any) => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet,
        price: r.price,
      }));

      if (organic.length > 0) {
        results.push({ source: 'organic', results: organic });
      }

      if (results.length === 0) {
        return `No flight information found for ${origin} to ${destination} on ${departDate}. Try different cities or dates.`;
      }

      return JSON.stringify(results, null, 2);
    } catch (err: any) {
      // console.log(`  ⚠️  Flight search error: ${err.message}`);
      return `Flight search failed: ${err.message}. Try again with different parameters.`;
    }
  },
  {
    name: 'search_flights',
    description:
      'Search for flights between two cities on specific dates. Uses Google search to find flight options with prices, airlines, and duration. Provide city names or airport codes.',
    schema: z.object({
      origin: z
        .string()
        .describe(
          'Origin city or airport (e.g. "New York", "JFK", "London", "Delhi")',
        ),
      destination: z
        .string()
        .describe(
          'Destination city or airport (e.g. "Tokyo", "NRT", "Paris", "Bali")',
        ),
      departDate: z.string().describe('Departure date in YYYY-MM-DD format'),
      returnDate: z
        .string()
        .optional()
        .describe('Return date in YYYY-MM-DD format (omit for one-way)'),
      adults: z.number().describe('Number of adult travelers'),
    }),
  },
);

export const searchHotels = tool(
  async ({
    destination,
    checkIn,
    checkOut,
    adults,
    preferences,
  }: {
    destination: string;
    checkIn: string;
    checkOut: string;
    adults: number;
    preferences?: string;
  }) => {
    // console.log(
    //   `\n  🏨 Searching hotels: ${destination}, ${checkIn} to ${checkOut}, ${adults} adults`,
    // );

    try {
      const prefPart = preferences ? ` ${preferences}` : '';
      const placesQuery = `hotels in ${destination}${prefPart}`;

      const data = await serperRequest('places', {
        q: placesQuery,
        num: 15,
      });

      const hotels = (data.places || []).map((p: any) => ({
        name: p.title,
        rating: p.rating,
        reviews: p.reviewsCount || p.reviews,
        address: p.address,
        type: p.type || p.category,
        priceLevel: p.priceLevel || p.price,
        hours: p.openingHours || p.hours,
        phone: p.phoneNumber || p.phone,
        website: p.website,
        description: p.description,
      }));

      if (hotels.length === 0) {
        return `No hotels found for ${destination}. Try a different destination or broader search (e.g. "luxury hotels in Tokyo").`;
      }

      const meta = {
        destination,
        checkIn,
        checkOut,
        adults,
        preferences: preferences || null,
      };

      return JSON.stringify({ meta, hotels }, null, 2);
    } catch (err: any) {
      // console.log(`  ⚠️  Hotel search error: ${err.message}`);
      return `Hotel search failed: ${err.message}. Try again with different parameters.`;
    }
  },
  {
    name: 'search_hotels',
    description:
      'Search for hotels in a destination city. Returns hotel options with prices, ratings, and availability from Google search results.',
    schema: z.object({
      destination: z
        .string()
        .describe(
          'Destination city (e.g. "Paris", "Tokyo", "Bali", "New York")',
        ),
      checkIn: z.string().describe('Check-in date in YYYY-MM-DD format'),
      checkOut: z.string().describe('Check-out date in YYYY-MM-DD format'),
      adults: z.number().describe('Number of adults'),
      preferences: z
        .string()
        .optional()
        .describe(
          'Optional preferences like "beachfront", "budget", "luxury", "near city center"',
        ),
    }),
  },
);

export const searchPlaces = tool(
  async ({ query }: { query: string }) => {
    // console.log(`\n  📍 Searching places: ${query}`);

    try {
      const data = await serperRequest('places', {
        q: query,
        num: 15,
      });

      const places = (data.places || []).map((p: any) => ({
        name: p.title,
        rating: p.rating,
        reviews: p.reviewsCount || p.reviews,
        address: p.address,
        type: p.type || p.category,
        hours: p.openingHours || p.hours,
        phone: p.phoneNumber || p.phone,
        website: p.website,
        description: p.description,
      }));

      if (places.length === 0) {
        return `No places found for "${query}". Try a different or broader search.`;
      }

      return JSON.stringify(places, null, 2);
    } catch (err: any) {
      // console.log(`  ⚠️  Places search error: ${err.message}`);
      return `Places search failed: ${err.message}. Try again.`;
    }
  },
  {
    name: 'search_places',
    description:
      'Find MULTIPLE attractions, landmarks, or venues. You formulate the search query. Use when: "best museums in Paris", "nightlife Shibuya Tokyo", "hidden gem temples Ubud Bali", "rooftop bars in Tokyo". Returns a list with ratings, hours, addresses. Do NOT use for single-venue questions like "when does WOMB open?" — use search_local_info for those.',
    schema: z.object({
      query: z
        .string()
        .describe(
          'Freeform search query you formulate. Include location and what you want (e.g. "best nightclubs in Shibuya Tokyo", "things to do in Paris", "temples in Kyoto", "beach clubs Bali"). Use trip context (e.g. if planning Tokyo trip, include Tokyo or neighborhood).',
        ),
    }),
  },
);

export const searchRestaurants = tool(
  async ({ query }: { query: string }) => {
    // console.log(`\n  🍽️  Searching restaurants: ${query}`);

    try {
      const data = await serperRequest('places', {
        q: query,
        num: 15,
      });

      const restaurants = (data.places || []).map((p: any) => ({
        name: p.title,
        rating: p.rating,
        reviews: p.reviewsCount || p.reviews,
        address: p.address,
        type: p.type || p.category,
        priceLevel: p.priceLevel || p.price,
        hours: p.openingHours || p.hours,
        phone: p.phoneNumber || p.phone,
        website: p.website,
        description: p.description,
      }));

      if (restaurants.length === 0) {
        return `No restaurants found for "${query}". Try a different or broader search.`;
      }

      return JSON.stringify(restaurants, null, 2);
    } catch (err: any) {
      // console.log(`  ⚠️  Restaurant search error: ${err.message}`);
      return `Restaurant search failed: ${err.message}. Try again.`;
    }
  },
  {
    name: 'search_restaurants',
    description:
      'Search for restaurants using Google Places. You formulate the search query. Use when: "best sushi in Shibuya Tokyo", "romantic restaurants Paris", "cheap eats near Senso-ji", "vegetarian Bali". Returns names, ratings, hours, addresses. Use trip context when relevant.',
    schema: z.object({
      query: z
        .string()
        .describe(
          'Freeform search query you formulate (e.g. "best ramen in Tokyo", "Italian restaurants Le Marais Paris", "beachfront dining Seminyak Bali"). Include location and preferences.',
        ),
    }),
  },
);

export const searchLocalInfo = tool(
  async ({ query }: { query: string }) => {
    // console.log(`\n  🔍 Searching local info: ${query}`);

    try {
      const data = await serperRequest('search', {
        q: query,
        num: 8,
      });

      const results: any = {};

      if (data.knowledgeGraph) {
        results.knowledgeGraph = {
          title: data.knowledgeGraph.title,
          type: data.knowledgeGraph.type,
          description: data.knowledgeGraph.description,
          attributes: data.knowledgeGraph.attributes,
        };
      }

      if (data.answerBox) {
        results.answerBox = {
          title: data.answerBox.title,
          answer: data.answerBox.answer,
          snippet: data.answerBox.snippet,
        };
      }

      results.topResults = (data.organic || []).slice(0, 5).map((r: any) => ({
        title: r.title,
        snippet: r.snippet,
        link: r.link,
      }));

      if (data.peopleAlsoAsk) {
        results.relatedQuestions = data.peopleAlsoAsk
          .slice(0, 4)
          .map((q: any) => ({
            question: q.question,
            answer: q.snippet,
          }));
      }

      return JSON.stringify(results, null, 2);
    } catch (err: any) {
      // console.log(`  ⚠️  Local info search error: ${err.message}`);
      return `Search failed: ${err.message}. Try rephrasing the query.`;
    }
  },
  {
    name: 'search_local_info',
    description:
      'Search Google for any travel-related info. Use for: (1) single-venue questions — "when does WOMB open?", "WOMB Tokyo opening hours", "Senso-ji temple address", "Restaurant X phone number"; (2) general info — weather, transport, visa, customs, best time to visit. Pass a freeform query. Returns knowledge graph, answer boxes, and top results. Use this (NOT search_places) when the user asks about ONE specific place\'s hours, address, or details.',
    schema: z.object({
      query: z
        .string()
        .describe(
          'Freeform search query. For single-venue: "[venue name] [city] opening hours" or "[venue] address". For general: "weather in Paris October", "Tokyo public transport", "best time to visit Bali", "WOMB Tokyo nightclub hours"',
        ),
    }),
  },
);

/** General-purpose search for the Supervisor. Use for weather, time, facts - anything the user asks that isn't trip planning. */
export const searchAnything = tool(
  async ({ query }: { query: string }) => {
    // console.log(`\n  🔍 Search: ${query}`);

    try {
      const data = await serperRequest('search', {
        q: query,
        num: 8,
      });

      const results: any = {};
      if (data.knowledgeGraph) {
        results.knowledgeGraph = data.knowledgeGraph;
      }
      if (data.answerBox) {
        results.answerBox = data.answerBox;
      }
      results.topResults = (data.organic || []).slice(0, 5).map((r: any) => ({
        title: r.title,
        snippet: r.snippet,
        link: r.link,
      }));

      return JSON.stringify(results, null, 2);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      return `Search failed: ${msg}`;
    }
  },
  {
    name: 'search_anything',
    description:
      'Search Google for ANY information. Use for: current weather, time in a city, general facts, news, definitions. Call this ANYTIME the user asks a question that is NOT about trip planning. Examples: "current weather Melbourne", "what time is it in Tokyo", "weather today", "temperature in Paris".',
    schema: z.object({
      query: z
        .string()
        .describe(
          'Search query. Example: "current weather Melbourne" or "weather today Paris" or "what time is it in Tokyo"',
        ),
    }),
  },
);

export const serperTools = [
  searchFlights,
  searchHotels,
  searchPlaces,
  searchRestaurants,
  searchLocalInfo,
  searchAnything,
];
