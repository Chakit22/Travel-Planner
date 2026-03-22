import 'dotenv/config';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const API_KEY = process.env.AVIATIONSTACK_API_KEY;

if (!API_KEY) {
  console.error('[flight-status] Missing AVIATIONSTACK_API_KEY — flight status disabled.');
}

export const checkFlightStatus = tool(
  async ({ flight_iata }: { flight_iata: string }) => {
    if (!API_KEY) {
      return 'Flight status unavailable — API key not configured.';
    }

    try {
      // NOTE: free tier is HTTP only, not HTTPS
      const url = `http://api.aviationstack.com/v1/flights?access_key=${API_KEY}&flight_iata=${flight_iata}`;
      const response = await fetch(url);
      const data: any = await response.json();

      if (!data.data || data.data.length === 0) {
        return `No flight found for ${flight_iata}. Check the flight number.`;
      }

      const flight = data.data[0];

      return JSON.stringify({
        flight: flight_iata,
        airline: flight.airline?.name,
        status: flight.flight_status,
        departure: {
          airport: flight.departure?.airport,
          iata: flight.departure?.iata,
          scheduled: flight.departure?.scheduled,
          estimated: flight.departure?.estimated,
          actual: flight.departure?.actual,
          delay_minutes: flight.departure?.delay,
          gate: flight.departure?.gate,
          terminal: flight.departure?.terminal,
        },
        arrival: {
          airport: flight.arrival?.airport,
          iata: flight.arrival?.iata,
          scheduled: flight.arrival?.scheduled,
          estimated: flight.arrival?.estimated,
          actual: flight.arrival?.actual,
          delay_minutes: flight.arrival?.delay,
          gate: flight.arrival?.gate,
          terminal: flight.arrival?.terminal,
        },
      }, null, 2);
    } catch (err: any) {
      return `Flight status check failed: ${err.message}`;
    }
  },
  {
    name: 'check_flight_status',
    description:
      'Check real-time status of a flight. Returns: status (scheduled/active/landed/cancelled/delayed), delay in minutes, gate, terminal, estimated times.',
    schema: z.object({
      flight_iata: z.string().describe('Flight IATA code, e.g. "QF401", "VA803", "JQ501"'),
    }),
  },
);
