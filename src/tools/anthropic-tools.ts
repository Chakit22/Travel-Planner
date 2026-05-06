import 'dotenv/config';
import { getJson } from 'serpapi';
import Anthropic from '@anthropic-ai/sdk';
import {
  recall_user_preferences_handler,
  save_user_preference_handler,
} from './memory';
import { find_nearby_places_handler } from './osm';
import { update_trip_metadata_handler } from './trip';

const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const OPENWEATHERMAP_API_KEY = process.env.OPENWEATHERMAP_API_KEY;
const AVIATIONSTACK_API_KEY = process.env.AVIATIONSTACK_API_KEY;

// Property Types for Properties
const property_types = {
  'Beach hotels': '12',
  'Boutique hotels': '13',
  Hostels: '14',
  Inns: '15',
  Motels: '16',
  Resorts: '17',
  'Spa hotels': '18',
  'Bed and breakfasts': '19',
  Other: '20',
  'Apartment hotels': '21',
  Minshuku: '22',
  'Japanese-style business hotels': '23',
  Ryokan: '24',
};

const amenities = {
  'Free parking': '1',
  Parking: '3',
  'Indoor pool': '4',
  'Outdoor pool': '5',
  Pool: '6',
  'Fitness center': '7',
  Restaurant: '8',
  'Free breakfast': '9',
  Spa: '10',
  'Beach access': '11',
  'Child-friendly': '12',
  Bar: '15',
  'Pet-friendly': '19',
  'Room service': '22',
  'Free Wi-Fi': '35',
  'Air-conditioned': '40',
  'All-inclusive available': '52',
  'Wheelchair accessible': '53',
  'EV charger': '61',
};

const hotel_class = {
  '2-star': '2',
  '3-star': '3',
  '4-star': '4',
  '5-star': '5',
};
const travel_class = {
  Economy: 1,
  'Premium economy': 2,
  Business: 3,
  First: 4,
};

const flight_sort_by = {
  'Top flights': 1,
  Price: 2,
  'Departure time': 3,
  'Arrival time': 4,
  Duration: 5,
  Emissions: 6,
};

const flight_stops = {
  Any: 0,
  'Nonstop only': 1,
  '1 stop or fewer': 2,
  '2 stops or fewer': 3,
};

// ─── HELPERS ────────────────────────────────────────────────────────────────

async function serperRequest(
  endpoint: 'search' | 'places',
  body: Record<string, any>,
): Promise<any> {
  const res = await fetch(`https://google.serper.dev/${endpoint}`, {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Serper ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── HANDLERS ───────────────────────────────────────────────────────────────

async function search_flights(input: any): Promise<string> {
  try {
    if (!input.return_date) {
      console.warn(
        '[search_flights] called without return_date — defaulting to one-way. The model should pass return_date for round-trips.',
      );
    }
    console.log(input.return_date);
    const params: Record<string, any> = {
      engine: 'google_flights',
      departure_id: input.departure_id,
      arrival_id: input.arrival_id,
      outbound_date: input.outbound_date,
      type: input.return_date ? 1 : 2,
      adults: input.adults ?? 1,
      travel_class:
        travel_class[input.travel_class as keyof typeof travel_class] ?? 1,
      sort_by:
        flight_sort_by[input.sort_by as keyof typeof flight_sort_by] ?? 2,
      currency: 'AUD',
      hl: 'en',
      gl: 'au',
      api_key: SERPAPI_API_KEY,
    };
    if (input.return_date) params.return_date = input.return_date;
    if (input.stops !== undefined)
      params.stops =
        flight_stops[input.stops as keyof typeof flight_stops] ?? 0;
    if (input.max_price !== undefined) params.max_price = input.max_price;
    if (input.include_airlines)
      params.include_airlines = input.include_airlines;
    if (input.exclude_airlines)
      params.exclude_airlines = input.exclude_airlines;

    const data = await getJson(params);

    console.log('data : ');
    console.log(data.other_flights[0]);

    // For round-trip results, the `flights` array is chronological:
    // outbound leg(s) first, then return leg(s). We split where there's a
    // multi-hour gap (overnight stay = boundary between trip directions).
    // Single-leg trips are obviously just outbound.
    const splitOutboundReturn = (
      legs: any[],
    ): { outbound: any[]; ret: any[] } => {
      if (!legs || legs.length <= 1) return { outbound: legs ?? [], ret: [] };
      let cutAt = -1;
      for (let i = 0; i < legs.length - 1; i++) {
        const arr = legs[i]?.arrival_airport?.time;
        const dep = legs[i + 1]?.departure_airport?.time;
        if (!arr || !dep) continue;
        const gapHours =
          (new Date(dep).getTime() - new Date(arr).getTime()) / 3.6e6;
        if (gapHours >= 6) {
          cutAt = i + 1;
          break;
        }
      }
      if (cutAt === -1) return { outbound: legs, ret: [] };
      return { outbound: legs.slice(0, cutAt), ret: legs.slice(cutAt) };
    };

    const summariseLeg = (legs: any[]) => {
      if (!legs || legs.length === 0) return null;
      const first = legs[0];
      const last = legs[legs.length - 1];
      const totalDuration = legs.reduce(
        (sum: number, l: any) => sum + (l.duration ?? 0),
        0,
      );
      return {
        airline: first?.airline,
        flight_number: first?.flight_number,
        depart: first?.departure_airport,
        arrive: last?.arrival_airport,
        stops: legs.length - 1,
        duration_min: totalDuration,
      };
    };

    // Round-trip second-stage call: SerpApi only returns outbound legs on the
    // first request. To get the matching return flight for an outbound option,
    // we re-call the API with that option's `departure_token`. We do this for
    // up to 5 outbound options to stay under quota.
    const fetchReturnLeg = async (departureToken: string): Promise<any[] | null> => {
      try {
        const retData: any = await getJson({
          ...params,
          departure_token: departureToken,
        });
        // The return-leg call returns its own best_flights[0].flights as the chosen pairing.
        const top = retData.best_flights?.[0] ?? retData.other_flights?.[0];
        return top?.flights ?? null;
      } catch (err: any) {
        console.warn(`[search_flights] return-leg fetch failed: ${err.message}`);
        return null;
      }
    };

    const extract = async (flights: any[]) => {
      const sliced = (flights || []).slice(0, 5);
      const results = await Promise.all(
        sliced.map(async (f: any) => {
          const outboundLegs = f.flights || [];
          let returnLegs: any[] = [];

          if (input.return_date && f.departure_token) {
            const fetched = await fetchReturnLeg(f.departure_token);
            if (fetched) returnLegs = fetched;
          } else if (!f.departure_token && (f.flights?.length ?? 0) > 1) {
            // Fallback for legacy/single-call shape: split the existing array.
            const split = splitOutboundReturn(f.flights);
            returnLegs = split.ret;
          }

          return {
            price: f.price,
            total_duration_min: f.total_duration,
            type: f.type,
            outbound: summariseLeg(outboundLegs),
            return: summariseLeg(returnLegs),
          };
        }),
      );
      return results;
    };

    const best = await extract(data.best_flights || []);
    const others = await extract(data.other_flights || []);

    console.log('\n[search_flights] ─────────────────────────────────────────');
    console.log(
      `[search_flights] params: ${input.departure_id} → ${input.arrival_id}, outbound=${input.outbound_date}, return=${input.return_date ?? '(one-way)'}, adults=${input.adults ?? 1}, type=${input.return_date ? 'round-trip' : 'one-way'}`,
    );
    console.log(
      `[search_flights] best_flights: ${best.length}, other_flights: ${others.length}`,
    );
    const preview = [...best, ...others].slice(0, 5);
    preview.forEach((f, i) => {
      const o = f.outbound;
      const r = f.return;
      console.log(`[search_flights] #${i + 1} $${f.price} (${f.type})`);
      if (o) {
        console.log(
          `   outbound: ${o.airline} ${o.flight_number ?? ''} · ${o.depart?.id} ${o.depart?.time} → ${o.arrive?.id} ${o.arrive?.time} · stops=${o.stops} · ${o.duration_min}m`,
        );
      } else {
        console.log('   outbound: (missing)');
      }
      if (r) {
        console.log(
          `   return:   ${r.airline} ${r.flight_number ?? ''} · ${r.depart?.id} ${r.depart?.time} → ${r.arrive?.id} ${r.arrive?.time} · stops=${r.stops} · ${r.duration_min}m`,
        );
      } else {
        console.log(
          '   return:   (missing — SerpApi did not include return leg)',
        );
      }
    });
    console.log('[search_flights] ─────────────────────────────────────────\n');

    return JSON.stringify({
      note: `Prices are TOTAL round-trip for all ${input.adults ?? 1} adult(s). Outbound and return timings included.`,
      best_flights: best,
      other_flights: others,
    });
  } catch (err: any) {
    return `Flight search failed: ${err.message}`;
  }
}

async function search_hotels(input: any): Promise<string> {
  try {
    const mapValues = (
      input: string | undefined,
      mapping: Record<string, string>,
    ) =>
      input
        ? input
            .split(',')
            .map((k) => mapping[k.trim()])
            .filter(Boolean)
            .join(',')
        : undefined;

    const params: Record<string, any> = {
      engine: 'google_hotels',
      q: input.query,
      check_in_date: input.check_in_date,
      check_out_date: input.check_out_date,
      adults: input.adults ?? 2,
      sort_by: input.sort_by ?? 3,
      currency: 'AUD',
      hl: 'en',
      api_key: SERPAPI_API_KEY,
    };
    if (input.max_price !== undefined) params.max_price = input.max_price;
    const mappedAmenities = mapValues(input.amenities, amenities);
    const mappedHotelClass = mapValues(input.hotel_class, hotel_class);
    const mappedPropertyTypes = mapValues(input.property_types, property_types);
    if (mappedAmenities) params.amenities = mappedAmenities;
    if (mappedHotelClass) params.hotel_class = mappedHotelClass;
    if (mappedPropertyTypes) params.property_types = mappedPropertyTypes;

    console.log('params : ');
    console.log(params);

    const data = await getJson(params);
    const hotels = (data.properties || []).slice(0, 5).map((p: any) => ({
      name: p.name,
      hotel_class: p.hotel_class,
      overall_rating: p.overall_rating,
      reviews: p.reviews,
      rate_per_night: p.rate_per_night?.extracted_lowest,
      total_rate: p.total_rate?.extracted_lowest,
      amenities: p.amenities,
    }));
    return JSON.stringify({ hotels });
  } catch (err: any) {
    return `Hotel search failed: ${err.message}`;
  }
}

async function search_places(input: any): Promise<string> {
  try {
    const data = await serperRequest('places', { q: input.query, num: 15 });
    const places = (data.places || []).map((p: any) => ({
      name: p.title,
      rating: p.rating,
      reviews: p.reviewsCount || p.reviews,
      address: p.address,
      type: p.type || p.category,
      website: p.website,
      description: p.description,
    }));
    if (places.length === 0) return `No places found for "${input.query}".`;
    return JSON.stringify(places);
  } catch (err: any) {
    return `Places search failed: ${err.message}`;
  }
}

async function search_weather(input: any): Promise<string> {
  if (!OPENWEATHERMAP_API_KEY) return 'Weather data unavailable.';
  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(input.city)}&appid=${OPENWEATHERMAP_API_KEY}&units=metric`;
    const res = await fetch(url);
    if (!res.ok) return `Weather lookup failed for "${input.city}".`;
    const data: any = await res.json();
    const days = new Map<string, any>();
    for (const item of data.list || []) {
      const date = new Date(item.dt * 1000).toISOString().split('T')[0];
      const day = days.get(date) || { temps: [], conditions: [], rain: 0 };
      day.temps.push(Math.round(item.main.temp));
      day.conditions.push(item.weather?.[0]?.description || 'unknown');
      day.rain += item.rain?.['3h'] || 0;
      days.set(date, day);
    }
    const forecast = Array.from(days.entries()).map(([date, d]: any) => ({
      date,
      high: Math.max(...d.temps),
      low: Math.min(...d.temps),
      condition: d.conditions[Math.floor(d.conditions.length / 2)],
      rain_mm: Math.round(d.rain * 10) / 10,
    }));
    return JSON.stringify({ city: input.city, forecast });
  } catch (err: any) {
    return `Weather lookup failed: ${err.message}`;
  }
}

async function search_events(input: any): Promise<string> {
  try {
    const data = await getJson({
      engine: 'google_events',
      q: input.query,
      hl: 'en',
      api_key: SERPAPI_API_KEY,
    });
    const events = (data.events_results || []).slice(0, 10).map((e: any) => ({
      title: e.title,
      date: e.date?.when,
      address: e.address?.join(', '),
      description: e.description,
      venue: e.venue?.name,
    }));
    if (events.length === 0) return `No events found for "${input.query}".`;
    return JSON.stringify({ events });
  } catch (err: any) {
    return `Events search failed: ${err.message}`;
  }
}

async function check_flight_status(input: any): Promise<string> {
  if (!AVIATIONSTACK_API_KEY) return 'Flight status unavailable.';
  try {
    const url = `http://api.aviationstack.com/v1/flights?access_key=${AVIATIONSTACK_API_KEY}&flight_iata=${input.flight_iata}`;
    const res = await fetch(url);
    const data: any = await res.json();
    if (!data.data || data.data.length === 0) {
      return `No flight found for ${input.flight_iata}.`;
    }
    const f = data.data[0];
    return JSON.stringify({
      flight: input.flight_iata,
      airline: f.airline?.name,
      status: f.flight_status,
      departure: f.departure,
      arrival: f.arrival,
    });
  } catch (err: any) {
    return `Flight status check failed: ${err.message}`;
  }
}

async function compose_itinerary(input: any): Promise<string> {
  // Pure JS — no LLM. Bundles selections + activities + weather into structured JSON.
  return JSON.stringify({
    trip: {
      origin: input.origin,
      destination: input.destination,
      dates: { depart: input.depart_date, return: input.return_date },
      travelers: input.travelers,
    },
    selected_flight: input.selected_flight,
    selected_hotel: input.selected_hotel,
    activities: input.activities || [],
    weather: input.weather || null,
    events: input.events || [],
  });
}

// ─── TOOL DEFINITIONS (Anthropic JSON Schema) ───────────────────────────────

export const tools: Anthropic.Tool[] = [
  {
    name: 'search_flights',
    description:
      'Search ROUND-TRIP flights via Google Flights. Always pass both outbound_date AND return_date — the user gave you both during gathering. Convert city names to airport codes (NYC→JFK, Tokyo→NRT, Melbourne→MEL, Paris→CDG, Delhi→DEL, London→LHR, Bangkok→BKK, Bali→DPS, Sydney→SYD, Hanoi→HAN, Ho Chi Minh→SGN).',
    input_schema: {
      type: 'object',
      properties: {
        departure_id: {
          type: 'string',
          description: 'Departure airport code, e.g. "MEL"',
        },
        arrival_id: {
          type: 'string',
          description: 'Arrival airport code, e.g. "NRT"',
        },
        outbound_date: { type: 'string', description: 'YYYY-MM-DD' },
        return_date: {
          type: 'string',
          description:
            'YYYY-MM-DD return date. REQUIRED for round-trip. Match the date the user provided during gathering.',
        },
        adults: { type: 'number', description: 'Number of adults' },
        travel_class: {
          type: 'string',
          enum: ['Economy', 'Premium economy', 'Business', 'First'],
        },
        stops: {
          type: 'string',
          enum: ['Any', 'Nonstop only', '1 stop or fewer', '2 stops or fewer'],
        },
        sort_by: {
          type: 'string',
          enum: [
            'Top flights',
            'Price',
            'Departure time',
            'Arrival time',
            'Duration',
            'Emissions',
          ],
        },
        max_price: { type: 'number' },
        include_airlines: {
          type: 'string',
          description:
            'Comma-separated IATA codes or alliance names (STAR_ALLIANCE, SKYTEAM, ONEWORLD)',
        },
        exclude_airlines: {
          type: 'string',
          description:
            'Comma-separated IATA codes or alliance names to exclude',
        },
      },
      required: [
        'departure_id',
        'arrival_id',
        'outbound_date',
        'return_date',
        'adults',
      ],
    },
  },
  {
    name: 'search_hotels',
    description:
      'Search hotels via Google Hotels. Provide query with city + dates.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'e.g. "hotels in Tokyo"' },
        check_in_date: { type: 'string', description: 'YYYY-MM-DD' },
        check_out_date: { type: 'string', description: 'YYYY-MM-DD' },
        adults: { type: 'number' },
        sort_by: {
          type: 'number',
          description: '3=Lowest price, 8=Highest rating',
        },
        max_price: { type: 'number' },
        amenities: {
          type: 'string',
          enum: [
            'Free parking',
            'Parking',
            'Indoor pool',
            'Outdoor pool',
            'Pool',
            'Fitness center',
            'Restaurant',
            'Free breakfast',
            'Spa',
            'Beach access',
            'Child-friendly',
            'Bar',
            'Pet-friendly',
            'Room service',
            'Free Wi-Fi',
            'Air-conditioned',
            'All-inclusive available',
            'Wheelchair accessible',
            'EV charger',
          ],
          description: 'Comma-separated amenity names from the enum list',
        },
        hotel_class: {
          type: 'string',
          enum: ['2-star', '3-star', '4-star', '5-star'],
          description: 'Comma-separated star ratings, e.g. "4-star,5-star"',
        },
        property_types: {
          type: 'string',
          enum: [
            'Beach hotels',
            'Boutique hotels',
            'Hostels',
            'Inns',
            'Motels',
            'Resorts',
            'Spa hotels',
            'Bed and breakfasts',
            'Other',
            'Apartment hotels',
            'Minshuku',
            'Japanese-style business hotels',
            'Ryokan',
          ],
          description: 'Comma-separated property type names from the enum list',
        },
      },
      required: ['query', 'check_in_date', 'check_out_date', 'adults'],
    },
  },
  {
    name: 'search_places',
    description:
      'Find attractions, restaurants, landmarks. Use freeform queries like "best museums in Paris" or "ramen in Shibuya Tokyo".',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Freeform search with location + what you want',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_weather',
    description:
      '5-day forecast. Returns daily high/low, conditions, rainfall.',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'e.g. "Tokyo"' },
      },
      required: ['city'],
    },
  },
  {
    name: 'search_events',
    description: 'Find events, festivals, concerts in a city for given dates.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'e.g. "events in Tokyo April 2026"',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'check_flight_status',
    description: 'Real-time flight status by IATA code.',
    input_schema: {
      type: 'object',
      properties: {
        flight_iata: { type: 'string', description: 'e.g. "QF401"' },
      },
      required: ['flight_iata'],
    },
  },
  {
    name: 'recall_user_preferences',
    description:
      "Pull the current user's memory: profile, past trips, likes, dislikes. Call this once per session if you need a refresher; the supervisor pre-warms it on session start. Returns a plain-text block.",
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'save_user_preference',
    description:
      'Persist a preference the user has expressed (in chat, button, or end-of-trip recap). Call this whenever the user signals taste: "I love seafood", "hostels are awful", "boutique is my style". One call per distinct preference.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description:
            'Taste bucket. Examples: cuisine, hotel_amenity, hotel_type, vibe, transport, activity, climate, budget.',
        },
        item: {
          type: 'string',
          description:
            'The thing they liked or disliked. Short noun phrase. Example: "seafood", "boutique hotels", "hostels".',
        },
        sentiment: {
          type: 'string',
          enum: ['like', 'dislike'],
        },
        context: {
          type: 'string',
          description: 'Optional one-line reason or quote.',
        },
      },
      required: ['category', 'item', 'sentiment'],
    },
  },
  {
    name: 'find_nearby_places',
    description:
      "COMPANION MODE ONLY. Find places near the user's live GPS location via OpenStreetMap. Returns up to 15 sorted by distance. After receiving the list, you MUST filter against user dislikes, boost likes, and return the top 3 with reasons.",
    input_schema: {
      type: 'object',
      properties: {
        lat: { type: 'number', description: 'Live latitude from user GPS.' },
        lng: { type: 'number', description: 'Live longitude from user GPS.' },
        radius_m: {
          type: 'number',
          description:
            'Search radius in meters. Default 1500 (~15 min walk). Max 5000.',
        },
        category: {
          type: 'string',
          enum: [
            'restaurant',
            'cafe',
            'bar',
            'food',
            'attraction',
            'museum',
            'park',
            'shopping',
            'any',
          ],
          description: 'Type of place to search for.',
        },
        limit: { type: 'number', description: 'Max results. Default 15.' },
      },
      required: ['lat', 'lng'],
    },
  },
  {
    name: 'update_trip_metadata',
    description:
      "Persist the trip's structured metadata to the database (destination, origin, dates, travelers, budget). Call this once destination + both dates + traveler count are confirmed by the user, and again whenever any of these values change. trip_id is injected automatically; never pass it.",
    input_schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        destination: {
          type: 'string',
          minLength: 1,
          description: 'City or region the user is travelling to, e.g. "Sydney", "Vietnam".',
        },
        origin: {
          type: 'string',
          minLength: 1,
          description: 'City the user is departing from, e.g. "Melbourne".',
        },
        departure_date: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: 'Outbound date in YYYY-MM-DD.',
        },
        return_date: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: 'Return date in YYYY-MM-DD.',
        },
        travelers: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Number of travellers on this trip.',
        },
        budget: {
          type: 'integer',
          minimum: 0,
          description: 'Total trip budget in AUD. Omit if the user has not specified one.',
        },
      },
      required: ['destination', 'origin', 'departure_date', 'return_date', 'travelers'],
    },
  },
  {
    name: 'compose_itinerary',
    description:
      'Bundle the user-selected flight + hotel with activities/weather/events into a structured trip object. Call this AFTER the user has picked their flight and hotel. Returns JSON you then write into a day-by-day itinerary in your reply.',
    input_schema: {
      type: 'object',
      properties: {
        origin: { type: 'string' },
        destination: { type: 'string' },
        depart_date: { type: 'string' },
        return_date: { type: 'string' },
        travelers: { type: 'number' },
        selected_flight: {
          type: 'object',
          description: 'The flight option the user picked',
        },
        selected_hotel: {
          type: 'object',
          description: 'The hotel option the user picked',
        },
        activities: { type: 'array', items: { type: 'object' } },
        weather: { type: 'object' },
        events: { type: 'array', items: { type: 'object' } },
      },
      required: ['destination', 'selected_flight', 'selected_hotel'],
    },
  },
];

// ─── HANDLER MAP (name → function) ──────────────────────────────────────────

export const tool_map: Record<string, (input: any) => Promise<string>> = {
  search_flights,
  search_hotels,
  search_places,
  search_weather,
  search_events,
  check_flight_status,
  compose_itinerary,
  recall_user_preferences: recall_user_preferences_handler,
  save_user_preference: save_user_preference_handler,
  find_nearby_places: find_nearby_places_handler,
  update_trip_metadata: update_trip_metadata_handler,
};

// Tools that need the active userId injected by the supervisor.
export const USER_SCOPED_TOOLS = new Set([
  'recall_user_preferences',
  'save_user_preference',
]);

// Tools that need the active tripId injected by the supervisor.
export const TRIP_SCOPED_TOOLS = new Set(['update_trip_metadata']);
