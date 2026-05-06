import 'dotenv/config';
import OpeningHours from 'opening_hours';

// ─── OPENING HOURS PARSER ───────────────────────────────────────────────────

/**
 * Parse an OSM opening_hours string and return {is_open_now, closes_at_iso}.
 * Returns {is_open_now: null} if the tag is missing or unparseable.
 */
function evaluateOpeningHours(
  raw: string | undefined,
  ref: Date = new Date(),
): { is_open_now: boolean | null; closes_at_iso?: string; opens_at_iso?: string; raw?: string } {
  if (!raw) return { is_open_now: null };
  try {
    const oh = new OpeningHours(raw);
    const isOpen = oh.getState(ref);
    const next = oh.getNextChange(ref);
    if (isOpen) {
      return {
        is_open_now: true,
        closes_at_iso: next ? next.toISOString() : undefined,
        raw,
      };
    }
    return {
      is_open_now: false,
      opens_at_iso: next ? next.toISOString() : undefined,
      raw,
    };
  } catch {
    return { is_open_now: null, raw };
  }
}

// ─── OVERPASS API (free, no key) ────────────────────────────────────────────

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_TIMEOUT_MS = 15_000;

// In-memory cache. Keyed by category + rounded lat/lng + radius. 60s TTL.
const cache = new Map<string, { expires: number; payload: string }>();
const CACHE_TTL_MS = 60_000;

// Category → Overpass tag selector(s).
const CATEGORY_TAGS: Record<string, string[]> = {
  restaurant: ['amenity=restaurant'],
  cafe: ['amenity=cafe'],
  bar: ['amenity=bar', 'amenity=pub'],
  food: ['amenity=restaurant', 'amenity=cafe', 'amenity=fast_food'],
  attraction: ['tourism=attraction', 'tourism=museum', 'tourism=gallery'],
  museum: ['tourism=museum'],
  park: ['leisure=park'],
  shopping: ['shop=mall', 'shop=department_store'],
  any: ['amenity=restaurant', 'amenity=cafe', 'tourism=attraction'],
};

function cacheKey(lat: number, lng: number, radius: number, category: string): string {
  // Round to ~110m precision so neighbours hit the cache.
  const rl = Math.round(lat * 1000) / 1000;
  const rg = Math.round(lng * 1000) / 1000;
  return `${category}|${rl}|${rg}|${radius}`;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

interface NearbyPlace {
  name: string;
  lat: number;
  lng: number;
  distance_m: number;
  category: string;
  cuisine?: string;
  address?: string;
  phone?: string;
  website?: string;
  /** true / false / null (unknown — tag not set or unparseable) */
  is_open_now: boolean | null;
  /** ISO timestamp of the next state change (close if open, open if closed) */
  closes_at_iso?: string;
  opens_at_iso?: string;
  /** Raw OSM opening_hours string for transparency */
  opening_hours_raw?: string;
}

async function queryOverpass(
  lat: number,
  lng: number,
  radius: number,
  tags: string[],
): Promise<any[]> {
  const tagBlocks = tags
    .map((t) => `node[${t}](around:${radius},${lat},${lng});`)
    .join('\n  ');
  const query = `[out:json][timeout:10];\n(\n  ${tagBlocks}\n);\nout body 30;`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OVERPASS_TIMEOUT_MS);
  try {
    const body = new URLSearchParams({ data: query });
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': 'AtlasTravelPlanner/1.0 (demo; localhost)',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Overpass ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as any;
    return json.elements ?? [];
  } finally {
    clearTimeout(timer);
  }
}

export async function findNearbyPlaces(args: {
  lat: number;
  lng: number;
  radius_m?: number;
  category?: string;
  limit?: number;
}): Promise<NearbyPlace[]> {
  const { lat, lng } = args;
  const radius = Math.min(Math.max(args.radius_m ?? 1500, 200), 5000);
  const category = (args.category ?? 'any').toLowerCase();
  const limit = Math.min(args.limit ?? 15, 30);

  const tags = CATEGORY_TAGS[category] ?? CATEGORY_TAGS.any;
  const key = cacheKey(lat, lng, radius, category);

  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return JSON.parse(cached.payload).slice(0, limit);
  }

  const elements = await queryOverpass(lat, lng, radius, tags);

  const now = new Date();
  const places: NearbyPlace[] = elements
    .filter((e: any) => e.tags?.name)
    .map((e: any) => {
      const oh = evaluateOpeningHours(e.tags.opening_hours, now);
      return {
        name: e.tags.name,
        lat: e.lat,
        lng: e.lon,
        distance_m: Math.round(haversineMeters(lat, lng, e.lat, e.lon)),
        category:
          e.tags.amenity || e.tags.tourism || e.tags.leisure || e.tags.shop || 'place',
        cuisine: e.tags.cuisine,
        address:
          [e.tags['addr:housenumber'], e.tags['addr:street'], e.tags['addr:city']]
            .filter(Boolean)
            .join(' ') || undefined,
        phone: e.tags.phone,
        website: e.tags.website,
        is_open_now: oh.is_open_now,
        closes_at_iso: oh.closes_at_iso,
        opens_at_iso: oh.opens_at_iso,
        opening_hours_raw: oh.raw,
      };
    })
    .sort((a, b) => a.distance_m - b.distance_m);

  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, payload: JSON.stringify(places) });

  return places.slice(0, limit);
}

// ─── HANDLER (Anthropic tool entrypoint) ────────────────────────────────────

export async function find_nearby_places_handler(input: any): Promise<string> {
  console.log('[find_nearby_places] input:', JSON.stringify(input));
  if (typeof input.lat !== 'number' || typeof input.lng !== 'number') {
    console.warn('[find_nearby_places] missing lat/lng — bailing.');
    return 'find_nearby_places error: lat/lng required (user has not shared location).';
  }
  try {
    const places = await findNearbyPlaces({
      lat: input.lat,
      lng: input.lng,
      radius_m: input.radius_m,
      category: input.category,
      limit: input.limit,
    });
    console.log(`[find_nearby_places] returned ${places.length} places.`);
    if (places.length === 0) {
      return JSON.stringify({ places: [], note: 'No places matched within the radius.' });
    }
    return JSON.stringify({ count: places.length, places });
  } catch (err: any) {
    console.error('[find_nearby_places] FAILED:', err?.message ?? err);
    console.error('[find_nearby_places] stack:', err?.stack);
    return `find_nearby_places failed: ${err.message}`;
  }
}
