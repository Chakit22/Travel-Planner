'use client';

import { motion } from 'framer-motion';

const LABELS: Record<string, string> = {
  search_flights: 'Searching for flights',
  search_hotels: 'Finding hotels',
  search_places: 'Looking up places',
  search_weather: 'Checking the weather',
  search_events: 'Looking up local events',
  check_flight_status: 'Checking flight status',
  compose_itinerary: 'Composing your itinerary',
  recall_user_preferences: 'Recalling your preferences',
  save_user_preference: 'Remembering that for next time',
  find_nearby_places: 'Scanning your surroundings',
};

function labelFor(name: string): string {
  return LABELS[name] ?? `Working on ${name.replace(/_/g, ' ')}`;
}

export interface ToolEntry {
  name: string;
  status: 'loading' | 'done';
}

export function ToolStatusLine({ entry }: { entry: ToolEntry }) {
  const label = labelFor(entry.name);
  const done = entry.status === 'done';

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-center gap-2.5 py-1"
    >
      <span className="relative flex items-center justify-center w-3 h-3 shrink-0">
        {done ? (
          <span className="text-[var(--color-brass)] text-[11px] leading-none">✓</span>
        ) : (
          <>
            <span className="absolute inset-0 rounded-full border border-[var(--color-violet-bright)]/40" />
            <span className="block w-1.5 h-1.5 rounded-full bg-[var(--color-violet-bright)] dot-pulse" />
          </>
        )}
      </span>
      <span
        className={`
          font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em]
          ${done ? 'text-[var(--color-text-tertiary)] line-through decoration-[var(--color-brass-dim)]' : 'text-[var(--color-violet-glow)]'}
        `}
      >
        {label}
        {!done && <span className="ml-1">…</span>}
      </span>
    </motion.div>
  );
}
