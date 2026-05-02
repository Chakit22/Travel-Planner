import 'dotenv/config';
import { getJson } from 'serpapi';
import Anthropic from '@anthropic-ai/sdk';

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
    const params: Record<string, any> = {
      engine: 'google_flights',
      departure_id: input.departure_id,
      arrival_id: input.arrival_id,
      outbound_date: input.outbound_date,
      type: input.return_date ? 1 : 2,
      adults: input.adults ?? 1,
      travel_class: input.travel_class ?? 1,
      sort_by: 2,
      currency: 'AUD',
      hl: 'en',
      gl: 'au',
      api_key: SERPAPI_API_KEY,
    };
    if (input.return_date) params.return_date = input.return_date;
    if (input.stops !== undefined) params.stops = input.stops;
    if (input.max_price !== undefined) params.max_price = input.max_price;

    const data = await getJson(params);
    const extract = (flights: any[]) =>
      (flights || []).slice(0, 5).map((f: any) => ({
        airline: f.flights?.[0]?.airline,
        price: f.price,
        total_duration: f.total_duration,
        stops: (f.flights?.length || 1) - 1,
        departure: f.flights?.[0]?.departure_airport,
        arrival: f.flights?.[f.flights.length - 1]?.arrival_airport,
      }));
    return JSON.stringify({
      note: `Prices are TOTAL for all ${input.adults ?? 1} adult(s).`,
      best_flights: extract(data.best_flights || []),
      other_flights: extract(data.other_flights || []),
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
      'Search flights via Google Flights. Convert city names to airport codes (NYC→JFK, Tokyo→NRT, Melbourne→MEL, Paris→CDG, Delhi→DEL, London→LHR, Bangkok→BKK, Bali→DPS, Sydney→SYD).',
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
          description: 'YYYY-MM-DD, omit for one-way',
        },
        adults: { type: 'number', description: 'Number of adults' },
        travel_class: {
          type: 'number',
          description: '1=Economy, 2=Premium, 3=Business, 4=First',
        },
        stops: {
          type: 'number',
          description: '1=Nonstop only, 2=1 stop or fewer',
        },
        max_price: { type: 'number' },
      },
      required: ['departure_id', 'arrival_id', 'outbound_date', 'adults'],
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
};
