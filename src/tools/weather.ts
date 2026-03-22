import 'dotenv/config';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// ─── Weather Tool (OpenWeatherMap 5-Day Forecast, free tier) ────────────────

const API_KEY = process.env.OPENWEATHERMAP_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5/forecast';

if (!API_KEY) {
  console.error(
    '[weather] Missing OPENWEATHERMAP_API_KEY in .env — weather tool disabled. Sign up at https://openweathermap.org/api',
  );
}

export const searchWeather = tool(
  async ({ city }: { city: string }) => {
    if (!API_KEY) {
      return 'Weather data unavailable — API key not configured.';
    }

    try {
      const url = `${BASE_URL}?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`;
      const response = await fetch(url);

      if (!response.ok) {
        return `Weather lookup failed for "${city}". Try a different city name.`;
      }

      const data: any = await response.json();

      // Group 3-hour entries by date, summarize each day
      const days = new Map<string, { temps: number[]; conditions: string[]; rain: number; wind: number[] }>();

      for (const item of data.list || []) {
        const date = new Date(item.dt * 1000).toISOString().split('T')[0];
        const day = days.get(date) || { temps: [], conditions: [], rain: 0, wind: [] };
        day.temps.push(Math.round(item.main.temp));
        day.conditions.push(item.weather?.[0]?.description || 'unknown');
        day.rain += item.rain?.['3h'] || 0;
        day.wind.push(item.wind?.speed || 0);
        days.set(date, day);
      }

      const forecast = Array.from(days.entries()).map(([date, d]) => {
        // Most frequent condition
        const counts = new Map<string, number>();
        for (const c of d.conditions) counts.set(c, (counts.get(c) || 0) + 1);
        let dominant = 'unknown';
        let max = 0;
        for (const [c, n] of counts) { if (n > max) { dominant = c; max = n; } }

        return {
          date,
          high: Math.max(...d.temps),
          low: Math.min(...d.temps),
          condition: dominant,
          rain_mm: Math.round(d.rain * 10) / 10,
          max_wind_kmh: Math.round(Math.max(...d.wind) * 3.6),
        };
      });

      return JSON.stringify({ city, forecast }, null, 2);
    } catch (err: any) {
      return `Weather lookup failed: ${err.message}. Try a different city name.`;
    }
  },
  {
    name: 'search_weather',
    description:
      'Get the 5-day weather forecast for a city. Returns daily high/low temps, conditions, rainfall, and wind. Use this to make the itinerary weather-aware.',
    schema: z.object({
      city: z.string().describe('City name, e.g. "Sydney", "Tokyo", "Paris"'),
    }),
  },
);
