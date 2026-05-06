import {
  BaseMessage,
  HumanMessage,
  mapStoredMessagesToChatMessages,
  mapChatMessagesToStoredMessages,
} from '@langchain/core/messages';
import { supervisor } from '../../agents/supervisor';
import { db } from '../../db/client';
import { trips, conversations, snapshots } from '../../db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

// ─── WEATHER FETCH ──────────────────────────────────────────────────────────

export interface WeatherDay {
  date: string;
  high: number;
  low: number;
  condition: string;
  rainMm: number;
}

async function fetchWeatherForecast(city: string): Promise<WeatherDay[]> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) {
    console.error('OPENWEATHERMAP_API_KEY not set — skipping weather fetch');
    return [];
  }

  const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;
  const res = await fetch(url);

  if (!res.ok) {
    console.error(`Weather API error for ${city}: ${res.status}`);
    return [];
  }

  const data: any = await res.json();

  // Group 3-hour forecasts by day
  const dayMap = new Map<string, { temps: number[]; conditions: string[]; rain: number }>();

  for (const item of data.list || []) {
    const date = item.dt_txt.split(' ')[0];
    if (!dayMap.has(date)) {
      dayMap.set(date, { temps: [], conditions: [], rain: 0 });
    }
    const day = dayMap.get(date)!;
    day.temps.push(item.main.temp);
    day.conditions.push(item.weather[0]?.main || 'Clear');
    day.rain += (item.rain?.['3h'] || 0);
  }

  const result: WeatherDay[] = [];
  for (const [date, info] of dayMap) {
    result.push({
      date,
      high: Math.round(Math.max(...info.temps)),
      low: Math.round(Math.min(...info.temps)),
      condition: mostCommon(info.conditions),
      rainMm: Math.round(info.rain * 10) / 10,
    });
  }

  return result;
}

function mostCommon(arr: string[]): string {
  const counts = new Map<string, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  let best = arr[0];
  let bestCount = 0;
  for (const [item, count] of counts) {
    if (count > bestCount) {
      best = item;
      bestCount = count;
    }
  }
  return best;
}

// ─── COMPARE WEATHER ────────────────────────────────────────────────────────

export function hasSignificantChange(
  oldWeather: WeatherDay[],
  newWeather: WeatherDay[],
): { changed: boolean; reason: string } {
  if (oldWeather.length === 0) {
    return { changed: false, reason: '' };
  }

  const reasons: string[] = [];

  for (const newDay of newWeather) {
    const oldDay = oldWeather.find((d) => d.date === newDay.date);
    if (!oldDay) continue;

    // Temperature swing > 10C
    if (Math.abs(newDay.high - oldDay.high) > 10) {
      reasons.push(
        `${newDay.date}: high changed from ${oldDay.high}C to ${newDay.high}C`,
      );
    }

    // Rain added where there was none
    if (oldDay.rainMm === 0 && newDay.rainMm > 2) {
      reasons.push(`${newDay.date}: rain expected (${newDay.rainMm}mm)`);
    }

    // Condition changed significantly (Clear → Rain/Thunderstorm)
    const severeConditions = ['Rain', 'Thunderstorm', 'Snow'];
    if (
      !severeConditions.includes(oldDay.condition) &&
      severeConditions.includes(newDay.condition)
    ) {
      reasons.push(
        `${newDay.date}: condition changed from ${oldDay.condition} to ${newDay.condition}`,
      );
    }
  }

  return {
    changed: reasons.length > 0,
    reason: reasons.join('; '),
  };
}

// ─── REPLAN A TRIP ──────────────────────────────────────────────────────────

export async function replanTrip(tripId: string, reason: string) {
  // Load conversation
  const [convo] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.tripId, tripId));

  if (!convo) {
    console.error(`No conversation found for trip ${tripId}`);
    return;
  }

  const storedMessages = (convo.messages as any[]) || [];
  if (storedMessages.length === 0) return;

  const history: BaseMessage[] = mapStoredMessagesToChatMessages(storedMessages);

  // Inject a replan request as a "user" message
  const replanPrompt = `The weather forecast has changed significantly for this trip. Reason: ${reason}. Please check the latest weather and update the itinerary accordingly — suggest indoor alternatives for any days with bad weather. Keep the same flights and hotel.`;
  history.push(new HumanMessage(replanPrompt));

  try {
    const stream = await supervisor.stream(
      { messages: history, phase: 'planning' },
      { recursionLimit: 50, streamMode: 'updates' as const },
    );

    let newItinerary = '';

    for await (const chunk of stream) {
      for (const [, update] of Object.entries(chunk)) {
        const u = update as any;
        for (const msg of u.messages || []) {
          history.push(msg);

          if (msg._getType?.() === 'ai') {
            let text = '';
            if (typeof msg.content === 'string') text = msg.content;
            else if (Array.isArray(msg.content)) {
              text = msg.content
                .filter((p: any) => p.type === 'text' && p.text)
                .map((p: any) => p.text)
                .join('');
            }
            // Capture the longest text as likely itinerary
            if (text.length > newItinerary.length) {
              newItinerary = text;
            }
          }
        }
      }
    }

    if (newItinerary.length > 200) {
      // Save as suggestion, don't auto-apply
      const [trip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, tripId));

      if (trip) {
        const currentSuggestions = (trip.suggestions as any[]) || [];
        currentSuggestions.push({
          type: 'weather',
          reason,
          newItinerary,
          createdAt: new Date().toISOString(),
        });

        await db
          .update(trips)
          .set({
            suggestions: currentSuggestions,
            updatedAt: new Date(),
          })
          .where(eq(trips.id, tripId));

        console.log(`Suggestion added for trip ${tripId}: ${reason}`);
      }

      // Save updated conversation (includes replan exchange)
      await db
        .update(conversations)
        .set({
          messages: mapChatMessagesToStoredMessages(history),
          updatedAt: new Date(),
        })
        .where(eq(conversations.tripId, tripId));
    }
  } catch (err) {
    console.error(`Replan failed for trip ${tripId}:`, err);
  }
}

// ─── CHECK ALL UPCOMING TRIPS ───────────────────────────────────────────────

export async function checkWeatherForUpcomingTrips() {
  const now = new Date();
  const fiveDaysOut = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  const nowStr = now.toISOString().split('T')[0];
  const futureStr = fiveDaysOut.toISOString().split('T')[0];

  // Find approved trips departing within the next 5 days
  const upcomingTrips = await db
    .select()
    .from(trips)
    .where(
      and(
        eq(trips.status, 'approved'),
        gte(trips.departureDate, nowStr),
        lte(trips.departureDate, futureStr),
      ),
    );

  console.log(`Weather check: ${upcomingTrips.length} upcoming trips found`);

  for (const trip of upcomingTrips) {
    if (!trip.destination) continue;

    // Fetch new weather
    const newWeather = await fetchWeatherForecast(trip.destination);
    if (newWeather.length === 0) continue;

    // Get last weather snapshot
    const lastSnapshots = await db
      .select()
      .from(snapshots)
      .where(
        and(
          eq(snapshots.tripId, trip.id),
          eq(snapshots.type, 'weather'),
        ),
      )
      .orderBy(sql`${snapshots.fetchedAt} DESC`)
      .limit(1);

    const oldWeather = lastSnapshots.length > 0
      ? (lastSnapshots[0].data as WeatherDay[])
      : [];

    // Compare
    const { changed, reason } = hasSignificantChange(oldWeather, newWeather);

    // Always save the new snapshot
    await db.insert(snapshots).values({
      tripId: trip.id,
      type: 'weather',
      data: newWeather,
    });

    // If significant change, trigger replan
    if (changed) {
      console.log(`Weather changed for trip ${trip.id} to ${trip.destination}: ${reason}`);
      await replanTrip(trip.id, reason);
    }
  }
}
