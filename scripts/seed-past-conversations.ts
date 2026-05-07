/**
 * Seed plausible past conversations onto the completed trips for the demo
 * (Bali, Tokyo, Bangkok). Idempotent — replaces any existing conversation
 * row for those trips. Safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/seed-past-conversations.ts
 */
import 'dotenv/config';
import { db, sql } from '../src/db/client';
import { conversations, trips, users } from '../src/db/schema';
import { and, eq } from 'drizzle-orm';

const DEMO_EMAIL = 'chakit-demo@atlas.dev';

interface SeedConvo {
  destination: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

const SEED: SeedConvo[] = [
  {
    destination: 'Bali',
    messages: [
      { role: 'user', content: 'Plan a 10-day trip to Bali in January for 2 of us, $4200 budget.' },
      {
        role: 'assistant',
        content:
          "Got it. Two travellers, Jan 12–22, $4,200 total. Quick check before I lock in flights — any preference between Ubud-first or coast-first? Last time you mentioned you love seafood, so I'll skew the back half toward Uluwatu either way.",
      },
      { role: 'user', content: "Ubud first sounds good. Quiet, slow start." },
      {
        role: 'assistant',
        content:
          'Perfect. Searching now…\n\n**Outbound:** Jetstar JQ35 MEL→DPS, 11:35 → 16:50, $612pp\n**Return:** Garuda GA716 DPS→MEL, 19:25 → 06:30+1, $589pp\n\n**Hotels:**\n- Bambu Indah (Ubud) — $310/night, organic farm villas, 4 nights\n- Suarga Padang Padang (Uluwatu) — $245/night, cliff villas, 6 nights\n\nThat lands you at $3,968 — under budget. Approve and I\'ll write up the day-by-day?',
      },
      { role: 'user', content: 'Yes do it.' },
      {
        role: 'assistant',
        content:
          "Here's your Bali itinerary, Day 1–10:\n\n• Day 1 — Arrive Denpasar 16:50, transfer to Ubud villa, quiet welcome dinner at Locavore To Go.\n• Day 2 — Tegalalang rice terraces walk at dawn, breakfast at Sayuri Healing Food, afternoon at the villa.\n• Day 3 — Ubud Monkey Forest, lunch at Hujan Locale, sunset cocktails at Bambu Indah.\n• Day 4 — Day trip to Tirta Empul water temple, evening Balinese cooking class.\n• Day 5 — Drive to Uluwatu (~2.5h). Check in. Sunset at Single Fin.\n• Day 6 — Surf lesson at Padang Padang beach. Seafood dinner at Menega Cafe (Jimbaran).\n• Day 7 — Nusa Lembongan day trip — snorkel at Crystal Bay, lunch at The Deck.\n• Day 8 — Slow morning. Massage at Sundari Day Spa. Dinner at Sundara.\n• Day 9 — Visit Uluwatu Temple at sunset for the kecak fire dance. Late dinner at Rock Bar.\n• Day 10 — Final breakfast at the villa. Transfer to airport for 19:25 return.\n\nWeather: 28–32°C, occasional afternoon showers — pack a light rain layer for Ubud days.",
      },
    ],
  },
  {
    destination: 'Tokyo',
    messages: [
      { role: 'user', content: 'Tokyo + Kyoto, October 4–13, 2 of us, around $5800.' },
      {
        role: 'assistant',
        content:
          'Nice — autumn in Kansai is excellent. 9 days, $5.8k. Splitting it 6 nights Tokyo / 3 nights Kyoto, or are you keen for more Kyoto time?',
      },
      { role: 'user', content: 'Lets do 6 Tokyo, 3 Kyoto.' },
      {
        role: 'assistant',
        content:
          "Locked in.\n\n**Flights:** Qantas QF79 MEL→HND, $1,260pp · QF80 return\n**Tokyo:** Shibuya Stream Excel Hotel, $215/night × 6 — boutique, walking distance to Shibuya scramble\n**Kyoto:** Hotel Kanra Kyoto, $295/night × 3 — machiya-style townhouse rooms\n**Shinkansen:** Hikari nozomi, $135pp each way\n\nTotal: $5,540. Want me to book the Ghibli Museum tickets too — they sell out 4 weeks ahead.",
      },
      { role: 'user', content: 'Yes please. Also we want sushi omakase one night.' },
      {
        role: 'assistant',
        content:
          'Saved. Sushi Saito is impossible without a Japanese resident referral, so I\'ll aim for **Sushi Tokami** (Ginza, 2 Michelin stars, $280pp) on night 4 — most reliable.\n\nDay-by-day:\n\n• Day 1 — Land HND 18:30. Train to Shibuya. Late izakaya at Donjaca.\n• Day 2 — Meiji Shrine at 7am (empty). Brunch in Omotesando. Afternoon Shimokitazawa coffee crawl.\n• Day 3 — Tsukiji outer market 6am. Walk to Hamarikyu Gardens. Evening at Golden Gai.\n• Day 4 — Ghibli Museum 10am slot. Lunch in Mitaka. **Sushi Tokami omakase** 7pm.\n• Day 5 — Day trip to Kamakura — Great Buddha, Hokokuji bamboo forest. Train back, ramen at Nakiryu.\n• Day 6 — Shinkansen 9am to Kyoto. Drop bags. Afternoon at Nanzen-ji aqueduct.\n• Day 7 — Fushimi Inari at sunrise (5:45am). Breakfast at % Arabica. Afternoon Gion stroll.\n• Day 8 — Arashiyama bamboo grove, lunch at Shoraian. Evening kaiseki at Kikunoi.\n• Day 9 — Slow morning. Train to HND. Fly home.',
      },
    ],
  },
  {
    destination: 'Bangkok',
    messages: [
      { role: 'user', content: 'Quick week in Bangkok, July 15–21, 2 of us, $2900.' },
      {
        role: 'assistant',
        content:
          "Tight budget but very doable in BKK. Riverside or Sukhumvit side?",
      },
      { role: 'user', content: 'Riverside.' },
      {
        role: 'assistant',
        content:
          '**Flights:** Thai Airways TG462 MEL→BKK, $740pp\n**Hotel:** Sala Rattanakosin — boutique riverside, $185/night × 6 ($1,110)\n**Total flights + hotel:** $2,590. Leaves $310 for food + tours.\n\nWeather alert: July is monsoon season. Afternoon showers most days. Built around early starts.',
      },
      {
        role: 'assistant',
        content:
          'Itinerary:\n\n• Day 1 — Arrive 17:30. Sunset rooftop drinks at Lebua Sky Bar (worth the splurge — $25pp).\n• Day 2 — Grand Palace + Wat Pho at 8am before crowds. Lunch at Tonkin-Annam. Massage at Health Land ($18).\n• Day 3 — Longtail boat through the klongs (Thonburi side). Lunch at Khlong Bang Luang artist village.\n• Day 4 — Day trip to Ayutthaya by train ($3 each way). Wat Mahathat ruins. Back by sunset.\n• Day 5 — Chatuchak weekend market (if Sat/Sun) or Or Tor Kor market. Evening dinner at Gaa ($95pp).\n• Day 6 — Cooking class at Blue Elephant ($65pp). Last sunset cruise.\n• Day 7 — Final massage. Fly home overnight.\n\nLoved the seafood comment from your Bali trip — Gaa lands the same vibe with more spice.',
      },
      { role: 'user', content: 'How much was the massage?' },
      { role: 'assistant', content: 'Health Land Asoke — 90-min Thai massage = 600 THB ($18). Tip 100 THB on top is standard.' },
    ],
  },
];

async function main() {
  console.log('[seed-convos] starting…');

  const [user] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL));
  if (!user) {
    console.error(`[seed-convos] demo user ${DEMO_EMAIL} not found. Run seed-demo-user.ts first.`);
    process.exit(1);
  }

  for (const seed of SEED) {
    const [trip] = await db
      .select()
      .from(trips)
      .where(and(eq(trips.userId, user.id), eq(trips.destination, seed.destination)));

    if (!trip) {
      console.warn(`[seed-convos] no trip found for destination=${seed.destination}, skipping`);
      continue;
    }

    const messages = seed.messages.map((m) => ({ role: m.role, content: m.content }));

    const [existing] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.tripId, trip.id));

    if (existing) {
      await db
        .update(conversations)
        .set({ messages, updatedAt: new Date() })
        .where(eq(conversations.tripId, trip.id));
      console.log(`[seed-convos] refreshed conversation for ${seed.destination}`);
    } else {
      await db.insert(conversations).values({ tripId: trip.id, messages });
      console.log(`[seed-convos] inserted conversation for ${seed.destination}`);
    }
  }

  console.log('[seed-convos] done.');
  await sql.end();
}

main().catch(async (err) => {
  console.error('[seed-convos] failed:', err);
  await sql.end();
  process.exit(1);
});
