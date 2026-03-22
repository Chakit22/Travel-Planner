import { tool } from '@langchain/core/tools';
import z from 'zod';
import Amadeus from 'amadeus';

if (!process.env.AMADEUS_CLIENT_ID || !process.env.AMADEUS_CLIENT_SECRET) {
  console.error(
    '❌ Missing AMADEUS_CLIENT_ID or AMADEUS_CLIENT_SECRET in .env\n' +
      '   Sign up free at: https://developers.amadeus.com/get-started/get-started-with-self-service-apis-335\n' +
      '   Then add your credentials to travel-planner/.env',
  );
  process.exit(1);
}

const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_CLIENT_ID,
  clientSecret: process.env.AMADEUS_CLIENT_SECRET,
  hostname:
    process.env.AMADEUS_HOSTNAME === 'production' ? 'production' : 'test',
});

const searchFlights = tool(
  async ({
    originCode,
    destinationCode,
    departDate,
    returnDate,
    adults,
  }: {
    originCode: string;
    destinationCode: string;
    departDate: string;
    returnDate?: string;
    adults: number;
  }) => {
    console.log(
      `\n  ✈️  Searching flights: ${originCode} → ${destinationCode}, depart ${departDate}${returnDate ? `, return ${returnDate}` : ''}, ${adults} adults`,
    );

    try {
      const params: any = {
        originLocationCode: originCode.toUpperCase(),
        destinationLocationCode: destinationCode.toUpperCase(),
        departureDate: departDate,
        adults: String(adults),
        currencyCode: 'USD',
        max: '5',
      };
      if (returnDate) {
        params.returnDate = returnDate;
      }

      const response = await amadeus.shopping.flightOffersSearch.get(params);
      const offers = response.data;

      if (!offers || offers.length === 0) {
        return 'No flights found for this route and date. Try different dates or nearby airports.';
      }

      const results = offers.map((offer: any) => {
        const outbound = offer.itineraries[0];
        const returnLeg = offer.itineraries[1];

        const formatSegments = (itin: any) =>
          itin.segments.map((seg: any) => ({
            airline: seg.carrierCode,
            flightNumber: `${seg.carrierCode}${seg.number}`,
            departure: `${seg.departure.iataCode} ${seg.departure.at}`,
            arrival: `${seg.arrival.iataCode} ${seg.arrival.at}`,
            duration: seg.duration,
          }));

        return {
          totalPrice: `$${offer.price.grandTotal}`,
          currency: offer.price.currency,
          outbound: {
            duration: outbound.duration,
            stops: outbound.segments.length - 1,
            segments: formatSegments(outbound),
          },
          ...(returnLeg && {
            return: {
              duration: returnLeg.duration,
              stops: returnLeg.segments.length - 1,
              segments: formatSegments(returnLeg),
            },
          }),
          bookableSeats: offer.numberOfBookableSeats,
        };
      });

      return JSON.stringify(results, null, 2);
    } catch (err: any) {
      const msg =
        err?.response?.result?.errors?.[0]?.detail ||
        err.message ||
        'Unknown error';
      console.log(`  ⚠️  Flight search error: ${msg}`);
      return `Flight search failed: ${msg}. Try different airport codes or dates.`;
    }
  },
  {
    name: 'search_flights',
    description:
      'Search for flights between two airports on specific dates using IATA airport codes. Returns real flight offers with prices, airlines, duration, and stops.',
    schema: z.object({
      originCode: z
        .string()
        .describe('Origin IATA airport code (e.g. "JFK", "LAX", "LHR", "DEL")'),
      destinationCode: z
        .string()
        .describe(
          'Destination IATA airport code (e.g. "NRT", "CDG", "SIN", "BKK")',
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

const searchHotels = tool(
  async ({
    cityCode,
    checkIn,
    checkOut,
    adults,
    ratings,
  }: {
    cityCode: string;
    checkIn: string;
    checkOut: string;
    adults: number;
    ratings?: string;
  }) => {
    console.log(
      `\n  🏨 Searching hotels: ${cityCode}, ${checkIn} to ${checkOut}, ${adults} adults`,
    );

    try {
      const listParams: any = {
        cityCode: cityCode.toUpperCase(),
      };
      if (ratings) {
        listParams.ratings = ratings;
      }

      const hotelListResponse =
        await amadeus.referenceData.locations.hotels.byCity.get(listParams);
      const hotels = hotelListResponse.data;

      if (!hotels || hotels.length === 0) {
        return `No hotels found in city ${cityCode}. Try a different city code.`;
      }

      const BULK_SIZE = 35;
      const hotelIds = hotels
        .slice(0, BULK_SIZE)
        .map((h: any) => h.hotelId)
        .join(',');

      console.log(
        `  🔍 Bulk querying ${Math.min(hotels.length, BULK_SIZE)} hotel IDs for offers...`,
      );

      const offersResponse = await amadeus.shopping.hotelOffersSearch.get({
        hotelIds,
        adults: String(adults),
        checkInDate: checkIn,
        checkOutDate: checkOut,
        currency: 'USD',
      });

      const offersData = offersResponse.data || [];

      if (offersData.length === 0) {
        return `Could not find available hotels in ${cityCode} for ${checkIn} to ${checkOut}. Try different dates or a nearby major city.`;
      }

      console.log(`  ✅ Found ${offersData.length} hotels with availability`);

      const results = offersData.slice(0, 10).map((hotel: any) => {
        const offer = hotel.offers?.[0];
        return {
          name: hotel.hotel?.name || 'Unknown',
          hotelId: hotel.hotel?.hotelId,
          rating: hotel.hotel?.rating ? `${hotel.hotel.rating} stars` : 'N/A',
          distance: hotel.hotel?.hotelDistance
            ? `${hotel.hotel.hotelDistance.distance} ${hotel.hotel.hotelDistance.distanceUnit} from center`
            : 'N/A',
          price: offer?.price?.total ? `$${offer.price.total}` : 'N/A',
          currency: offer?.price?.currency || 'USD',
          roomType: offer?.room?.typeEstimated?.category || 'Standard',
          bedType: offer?.room?.typeEstimated?.bedType || 'N/A',
          checkIn: offer?.checkInDate,
          checkOut: offer?.checkOutDate,
        };
      });

      return JSON.stringify(results, null, 2);
    } catch (err: any) {
      const msg =
        err?.response?.result?.errors?.[0]?.detail ||
        err.message ||
        'Unknown error';
      console.log(`  ⚠️  Hotel search error: ${msg}`);
      return `Hotel search failed: ${msg}. Try a different city code (e.g. "PAR" for Paris, "LON" for London, "NYC" for New York).`;
    }
  },
  {
    name: 'search_hotels',
    description:
      'Search for hotels in a city using IATA city codes. Returns real hotel offers with prices, ratings, room types, and availability.',
    schema: z.object({
      cityCode: z
        .string()
        .describe(
          'IATA city code (e.g. "PAR" for Paris, "LON" for London, "NYC" for New York, "TYO" for Tokyo)',
        ),
      checkIn: z.string().describe('Check-in date in YYYY-MM-DD format'),
      checkOut: z.string().describe('Check-out date in YYYY-MM-DD format'),
      adults: z.number().describe('Number of adults per room'),
      ratings: z
        .string()
        .optional()
        .describe('Comma-separated star ratings to filter (e.g. "3,4,5")'),
    }),
  },
);

const searchCheapestDates = tool(
  async ({
    originCode,
    destinationCode,
    destinationCityCode,
    windowStart,
    windowEnd,
    nights,
    adults,
  }: {
    originCode: string;
    destinationCode: string;
    destinationCityCode: string;
    windowStart: string;
    windowEnd: string;
    nights: number;
    adults: number;
  }) => {
    console.log(
      `\n  📅 Searching cheapest ${nights}-night window: ${originCode} → ${destinationCode} (city: ${destinationCityCode}), between ${windowStart} and ${windowEnd}, ${adults} adults`,
    );

    const start = new Date(windowStart);
    const end = new Date(windowEnd);

    const departDates: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const returnDate = new Date(cursor);
      returnDate.setDate(returnDate.getDate() + nights);
      if (returnDate <= new Date(windowEnd)) {
        departDates.push(cursor.toISOString().split('T')[0]);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (departDates.length === 0) {
      return `Window too narrow for ${nights} nights between ${windowStart} and ${windowEnd}. Try a wider window.`;
    }

    console.log(
      `  🔍 Checking ${departDates.length} depart date(s): ${departDates.join(', ')}`,
    );

    let hotelIds: string | null = null;
    try {
      const hotelListResponse =
        await amadeus.referenceData.locations.hotels.byCity.get({
          cityCode: destinationCityCode.toUpperCase(),
        });
      const hotels = hotelListResponse.data;
      if (hotels && hotels.length > 0) {
        const BULK_SIZE = 35;
        hotelIds = hotels
          .slice(0, BULK_SIZE)
          .map((h: any) => h.hotelId)
          .join(',');
        console.log(
          `  🏨 Found ${hotels.length} hotels, using top ${Math.min(hotels.length, BULK_SIZE)} for pricing`,
        );
      }
    } catch (err: any) {
      console.log(
        `  ⚠️  Could not fetch hotel list for ${destinationCityCode}: ${err.message}`,
      );
    }

    const results = await Promise.all(
      departDates.map(async (departDate) => {
        const returnDate = new Date(departDate);
        returnDate.setDate(returnDate.getDate() + nights);
        const returnDateStr = returnDate.toISOString().split('T')[0];

        const [flightResult, hotelResult] = await Promise.all([
          (async () => {
            try {
              const response = await amadeus.shopping.flightOffersSearch.get({
                originLocationCode: originCode.toUpperCase(),
                destinationLocationCode: destinationCode.toUpperCase(),
                departureDate: departDate,
                returnDate: returnDateStr,
                adults: String(adults),
                currencyCode: 'USD',
                max: '1',
              });
              return response.data?.[0] || null;
            } catch {
              return null;
            }
          })(),
          (async () => {
            if (!hotelIds) return null;
            try {
              const response = await amadeus.shopping.hotelOffersSearch.get({
                hotelIds,
                adults: String(adults),
                checkInDate: departDate,
                checkOutDate: returnDateStr,
                currency: 'USD',
              });
              const offers = response.data || [];
              if (offers.length === 0) return null;
              let cheapest: any = null;
              for (const hotel of offers) {
                const price = parseFloat(hotel.offers?.[0]?.price?.total);
                if (!isNaN(price) && (!cheapest || price < cheapest.price)) {
                  cheapest = {
                    price,
                    name: hotel.hotel?.name || 'Unknown',
                    hotelId: hotel.hotel?.hotelId,
                    rating: hotel.hotel?.rating,
                    roomType:
                      hotel.offers?.[0]?.room?.typeEstimated?.category ||
                      'Standard',
                  };
                }
              }
              return cheapest;
            } catch {
              return null;
            }
          })(),
        ]);

        if (!flightResult) return null;

        const outbound = flightResult.itineraries[0];
        const ret = flightResult.itineraries[1];
        const flightPrice = parseFloat(flightResult.price.grandTotal);
        const hotelPrice = hotelResult?.price ?? 0;

        return {
          departDate,
          returnDate: returnDateStr,
          flightPrice,
          flightPriceFormatted: `$${flightResult.price.grandTotal}`,
          outboundStops: outbound.segments.length - 1,
          returnStops: ret ? ret.segments.length - 1 : 0,
          outboundDuration: outbound.duration,
          airline: outbound.segments[0].carrierCode,
          hotel: hotelResult
            ? {
                name: hotelResult.name,
                hotelId: hotelResult.hotelId,
                rating: hotelResult.rating
                  ? `${hotelResult.rating} stars`
                  : 'N/A',
                roomType: hotelResult.roomType,
                totalPrice: hotelPrice,
                priceFormatted: `$${hotelPrice.toFixed(2)}`,
              }
            : null,
          combinedTotal: flightPrice + hotelPrice,
          combinedTotalFormatted: `$${(flightPrice + hotelPrice).toFixed(2)}`,
        };
      }),
    );

    const valid = results
      .filter(Boolean)
      .sort((a: any, b: any) => a.combinedTotal - b.combinedTotal);

    if (valid.length === 0) {
      return `No results found for any dates in the window ${windowStart}–${windowEnd}. Try different airports or a wider window.`;
    }

    const cheapest = valid[0] as any;
    const summary = {
      cheapestOption: {
        departDate: cheapest.departDate,
        returnDate: cheapest.returnDate,
        flightPrice: cheapest.flightPriceFormatted,
        airline: cheapest.airline,
        outboundStops: cheapest.outboundStops,
        outboundDuration: cheapest.outboundDuration,
        hotel: cheapest.hotel,
        combinedTotal: cheapest.combinedTotalFormatted,
      },
      allOptions: valid.map((r: any) => ({
        departDate: r.departDate,
        returnDate: r.returnDate,
        flightPrice: r.flightPriceFormatted,
        hotelPrice: r.hotel?.priceFormatted ?? 'N/A',
        hotelName: r.hotel?.name ?? 'N/A',
        combinedTotal: r.combinedTotalFormatted,
        stops: r.outboundStops,
      })),
    };

    return JSON.stringify(summary, null, 2);
  },
  {
    name: 'search_cheapest_dates',
    description:
      'Search all possible departure dates within a date window for a given trip duration. Searches BOTH flights AND hotels in parallel for every date combination and returns results ranked by cheapest combined total (flight + hotel). Use this when the user says things like "3 nights anytime in the first week of October" or "flexible dates in November".',
    schema: z.object({
      originCode: z
        .string()
        .describe('Origin IATA airport code (e.g. "JFK", "LHR")'),
      destinationCode: z
        .string()
        .describe('Destination IATA airport code (e.g. "NRT", "CDG")'),
      destinationCityCode: z
        .string()
        .describe(
          'Destination IATA city code for hotel search (e.g. "PAR" for Paris, "LON" for London, "TYO" for Tokyo, "NYC" for New York)',
        ),
      windowStart: z
        .string()
        .describe('Start of the flexible date window in YYYY-MM-DD format'),
      windowEnd: z
        .string()
        .describe('End of the flexible date window in YYYY-MM-DD format'),
      nights: z.number().describe('Number of nights for the trip'),
      adults: z.number().describe('Number of adult travelers'),
    }),
  },
);

export const amadeusTools = [searchFlights, searchHotels, searchCheapestDates];
