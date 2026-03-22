import 'dotenv/config';
import { tool } from '@langchain/core/tools';
import { getJson } from 'serpapi';
import z from 'zod';

const SERPAPI_API_KEY = process.env.SERPAPI_API_KEY;

if (!SERPAPI_API_KEY) {
  console.error(
    'Missing SERPAPI_API_KEY in .env — sign up at https://serpapi.com',
  );
  process.exit(1);
}

// ─── Flight Tool (Google Flights via SerpApi) ─────────────────────────────────

export const searchFlightsSerpApi = tool(
  async ({
    departure_id,
    arrival_id,
    outbound_date,
    return_date,
    adults,
    travel_class,
    stops,
    bags,
    max_price,
    max_duration,
    include_airlines,
    exclude_airlines,
    emissions,
    children,
    infants_in_seat,
    infants_on_lap,
  }: {
    departure_id: string;
    arrival_id: string;
    outbound_date: string;
    return_date?: string;
    adults: number;
    travel_class: number;
    stops?: number;
    bags?: number;
    max_price?: number;
    max_duration?: number;
    include_airlines?: string;
    exclude_airlines?: string;
    emissions?: number;
    children?: number;
    infants_in_seat?: number;
    infants_on_lap?: number;
  }) => {
    try {
      const params: Record<string, any> = {
        engine: 'google_flights',
        departure_id,
        arrival_id,
        outbound_date,
        type: return_date ? 1 : 2, // 1=round trip, 2=one way
        adults,
        travel_class,
        sort_by: 2, // sort by price (cheapest first)
        currency: 'AUD',
        hl: 'en',
        gl: 'au',
        api_key: SERPAPI_API_KEY,
      };

      if (return_date) params.return_date = return_date;
      if (stops !== undefined) params.stops = stops;
      if (bags !== undefined) params.bags = bags;
      if (max_price !== undefined) params.max_price = max_price;
      if (max_duration !== undefined) params.max_duration = max_duration;
      if (include_airlines) params.include_airlines = include_airlines;
      if (exclude_airlines) params.exclude_airlines = exclude_airlines;
      if (emissions !== undefined) params.emissions = emissions;
      if (children !== undefined) params.children = children;
      if (infants_in_seat !== undefined) params.infants_in_seat = infants_in_seat;
      if (infants_on_lap !== undefined) params.infants_on_lap = infants_on_lap;

      const { api_key: _, ...safeParams } = params;
      console.error('[flights] request params:', JSON.stringify(safeParams, null, 2));
      const data = await getJson(params);
      console.error('[flights] response keys:', Object.keys(data));
      console.error('[flights] best_flights count:', (data.best_flights || []).length);
      console.error('[flights] other_flights count:', (data.other_flights || []).length);

      const extract = (flights: any[]) =>
        (flights || []).slice(0, 5).map((f: any) => ({
          airline: f.flights?.[0]?.airline,
          price: f.price,
          total_duration: f.total_duration,
          stops: (f.flights?.length || 1) - 1,
          departure: f.flights?.[0]?.departure_airport,
          arrival: f.flights?.[f.flights.length - 1]?.arrival_airport,
          legs: f.flights?.map((leg: any) => ({
            airline: leg.airline,
            flight_number: leg.flight_number,
            departure: `${leg.departure_airport?.id} ${leg.departure_airport?.time}`,
            arrival: `${leg.arrival_airport?.id} ${leg.arrival_airport?.time}`,
            duration: leg.duration,
          })),
        }));

      const result = {
        note: `Prices are TOTAL for all ${adults} adult(s). Divide by ${adults} to get per-person price.`,
        adults,
        best_flights: extract(data.best_flights || []),
        other_flights: extract(data.other_flights || []),
        price_insights: data.price_insights,
      };

      return JSON.stringify(result, null, 2);
    } catch (err: any) {
      return `Flight search failed: ${err.message}. Try different airport codes or dates.`;
    }
  },
  {
    name: 'search_flights',
    description:
      'Search for flights using Google Flights. Returns real airline prices, durations, and flight numbers. Provide airport codes, dates, and traveler count.',
    schema: z.object({
      departure_id: z
        .string()
        .describe('Departure airport code, e.g. "MEL", "JFK", "DEL"'),
      arrival_id: z
        .string()
        .describe('Arrival airport code, e.g. "NRT", "CDG", "BKK"'),
      outbound_date: z.string().describe('Departure date YYYY-MM-DD'),
      return_date: z
        .string()
        .optional()
        .describe('Return date YYYY-MM-DD. Omit for one-way.'),
      adults: z.number().default(1).describe('Number of adults'),
      travel_class: z
        .number()
        .default(1)
        .describe('1=Economy, 2=Premium economy, 3=Business, 4=First'),
      stops: z
        .number()
        .optional()
        .describe('Max stops: 0=Any, 1=Nonstop only, 2=1 stop or fewer, 3=2 stops or fewer'),
      bags: z
        .number()
        .optional()
        .describe('Number of carry-on bags'),
      max_price: z
        .number()
        .optional()
        .describe('Maximum ticket price'),
      max_duration: z
        .number()
        .optional()
        .describe('Maximum flight duration in minutes, e.g. 600 for 10 hours'),
      include_airlines: z
        .string()
        .optional()
        .describe('Comma-separated IATA codes or alliances: STAR_ALLIANCE, SKYTEAM, ONEWORLD. e.g. "QF,VA" or "ONEWORLD"'),
      exclude_airlines: z
        .string()
        .optional()
        .describe('Comma-separated IATA codes or alliances to exclude'),
      emissions: z
        .number()
        .optional()
        .describe('1=Less emissions only'),
      children: z
        .number()
        .optional()
        .describe('Number of children'),
      infants_in_seat: z
        .number()
        .optional()
        .describe('Number of infants in seat'),
      infants_on_lap: z
        .number()
        .optional()
        .describe('Number of infants on lap'),
    }),
  },
);

// ─── Hotel Tool (Google Hotels via SerpApi) ───────────────────────────────────

export const searchHotelsSerpApi = tool(
  async ({
    query,
    check_in_date,
    check_out_date,
    adults,
    hotel_class,
    sort_by,
    min_price,
    max_price,
    rating,
    children,
    children_ages,
    free_cancellation,
    special_offers,
    eco_certified,
    property_types,
    amenities,
    vacation_rentals,
    bedrooms,
    bathrooms,
  }: {
    query: string;
    check_in_date: string;
    check_out_date: string;
    adults: number;
    hotel_class?: string;
    sort_by: number;
    min_price?: number;
    max_price?: number;
    rating?: number;
    children?: number;
    children_ages?: string;
    free_cancellation?: boolean;
    special_offers?: boolean;
    eco_certified?: boolean;
    property_types?: string;
    amenities?: string;
    vacation_rentals?: boolean;
    bedrooms?: number;
    bathrooms?: number;
  }) => {
    try {
      const params: Record<string, any> = {
        engine: 'google_hotels',
        q: query,
        check_in_date,
        check_out_date,
        adults,
        sort_by,
        currency: 'USD',
        hl: 'en',
        api_key: SERPAPI_API_KEY,
      };

      if (hotel_class) params.hotel_class = hotel_class;
      if (min_price !== undefined) params.min_price = min_price;
      if (max_price !== undefined) params.max_price = max_price;
      if (rating !== undefined) params.rating = rating;
      if (children !== undefined) params.children = children;
      if (children_ages) params.children_ages = children_ages;
      if (free_cancellation) params.free_cancellation = free_cancellation;
      if (special_offers) params.special_offers = special_offers;
      if (eco_certified) params.eco_certified = eco_certified;
      if (property_types) params.property_types = property_types;
      if (amenities) params.amenities = amenities;
      if (vacation_rentals) params.vacation_rentals = vacation_rentals;
      if (bedrooms !== undefined) params.bedrooms = bedrooms;
      if (bathrooms !== undefined) params.bathrooms = bathrooms;

      const { api_key: _, ...safeParams } = params;
      console.error('[hotels] request params:', JSON.stringify(safeParams, null, 2));
      const data = await getJson(params);
      const { search_metadata: _meta, ...safeData } = data;
      console.error('[hotels] full response:', JSON.stringify(safeData, null, 2));

      const hotels = (data.properties || []).slice(0, 5).map((p: any) => ({
        name: p.name,
        hotel_class: p.hotel_class,
        overall_rating: p.overall_rating,
        reviews: p.reviews,
        rate_per_night: p.rate_per_night?.extracted_lowest,
        total_rate: p.total_rate?.extracted_lowest,
        check_in_time: p.check_in_time,
        check_out_time: p.check_out_time,
        amenities: p.amenities,
        nearby_places: p.nearby_places,
      }));

      const calcNights = Math.round(
        (new Date(check_out_date).getTime() -
          new Date(check_in_date).getTime()) /
          (1000 * 60 * 60 * 24),
      );

      return JSON.stringify(
        {
          note: `rate_per_night is the TOTAL room rate per night (not per person). total_rate is for the ENTIRE stay (${calcNights} nights). These are room prices — typically 1 room fits 2 adults.`,
          hotels,
          search_info: { check_in_date, check_out_date, nights: calcNights, adults },
        },
        null,
        2,
      );
    } catch (err: any) {
      return `Hotel search failed: ${err.message}. Try a different query or dates.`;
    }
  },
  {
    name: 'search_hotels',
    description:
      'Search for hotels using Google Hotels. Returns real hotel names, prices per night, ratings, and amenities. Provide a search query with location, dates, and guest count.',
    schema: z.object({
      query: z
        .string()
        .describe('Hotel search query, e.g. "hotels in Tokyo"'),
      check_in_date: z.string().describe('Check-in date YYYY-MM-DD'),
      check_out_date: z.string().describe('Check-out date YYYY-MM-DD'),
      adults: z.number().default(2).describe('Number of adults'),
      hotel_class: z
        .string()
        .optional()
        .describe('Star rating: "2","3","4","5" or comma-separated "3,4,5"'),
      sort_by: z
        .number()
        .default(3)
        .describe('3=Lowest price, 8=Highest rating, 13=Most reviewed'),
      min_price: z
        .number()
        .optional()
        .describe('Minimum price per night in currency units'),
      max_price: z
        .number()
        .optional()
        .describe('Maximum price per night in currency units'),
      rating: z
        .number()
        .optional()
        .describe('Minimum guest rating: 7=3.5+, 8=4.0+, 9=4.5+'),
      children: z
        .number()
        .optional()
        .describe('Number of children'),
      children_ages: z
        .string()
        .optional()
        .describe('Comma-separated ages of children, range 1-17, e.g. "5,8"'),
      free_cancellation: z
        .boolean()
        .optional()
        .describe('Only show hotels with free cancellation'),
      special_offers: z
        .boolean()
        .optional()
        .describe('Only show hotels with special offers/deals'),
      eco_certified: z
        .boolean()
        .optional()
        .describe('Only show eco-certified hotels'),
      property_types: z
        .string()
        .optional()
        .describe(
          'Comma-separated property type IDs. 12=Beach hotels, 13=Boutique hotels, 14=Hostels, 15=Inns, 16=Motels, 17=Resorts, 18=Spa hotels, 19=B&Bs, 20=Other, 21=Apartment hotels, 24=Ryokan',
        ),
      amenities: z
        .string()
        .optional()
        .describe(
          'Comma-separated amenity IDs. 1=Free parking, 4=Indoor pool, 5=Outdoor pool, 6=Pool, 7=Fitness center, 8=Restaurant, 9=Free breakfast, 10=Spa, 11=Beach access, 12=Child-friendly, 15=Bar, 19=Pet-friendly, 22=Room service, 35=Free Wi-Fi, 40=Air-conditioned, 52=All-inclusive, 53=Wheelchair accessible, 61=EV charger',
        ),
      vacation_rentals: z
        .boolean()
        .optional()
        .describe('Search vacation rentals instead of hotels'),
      bedrooms: z
        .number()
        .optional()
        .describe('Min bedrooms (only with vacation_rentals)'),
      bathrooms: z
        .number()
        .optional()
        .describe('Min bathrooms (only with vacation_rentals)'),
    }),
  },
);
