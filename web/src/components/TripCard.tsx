'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Trip } from '@/lib/api';

function formatDateMon(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }).toUpperCase();
}

function formatYear(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr + 'T00:00:00').getFullYear();
}

function statusLabel(status: string): { label: string; tone: 'brass' | 'violet' | 'mute' } {
  if (status === 'completed' || status === 'past') return { label: 'Logged', tone: 'brass' };
  if (status === 'draft') return { label: 'Draft', tone: 'violet' };
  return { label: status, tone: 'mute' };
}

export function TripCard({ trip, index }: { trip: Trip; index: number }) {
  const dep = formatDateMon(trip.departureDate);
  const ret = formatDateMon(trip.returnDate);
  const year = formatYear(trip.returnDate ?? trip.departureDate);
  const { label, tone } = statusLabel(trip.status);

  const toneClass =
    tone === 'brass'
      ? 'border-[var(--color-brass-dim)] text-[var(--color-brass)]'
      : tone === 'violet'
      ? 'border-[var(--color-violet-bright)]/50 text-[var(--color-violet-glow)]'
      : 'border-[var(--color-ink-line)] text-[var(--color-text-tertiary)]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link href={`/trip/${trip.id}`} className="block group">
        <article
          className="
            relative p-7 bg-[var(--color-ink-paper)]
            border border-[var(--color-ink-line)]
            hover:bg-[var(--color-ink-vellum)] hover:border-[var(--color-violet-bright)]/40
            transition-all duration-300
            overflow-hidden
          "
        >
          <div className="flex items-start justify-between mb-2 gap-4">
            <h2 className="font-[family-name:var(--font-display)] text-3xl font-[400] tracking-[-0.015em] text-[var(--color-text-primary)] leading-[1.15]">
              {trip.destination || 'Untitled trip'}
            </h2>
            <span
              className={`
                shrink-0 inline-flex items-center h-6 px-2.5 rounded-full border
                font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.2em]
                ${toneClass}
              `}
            >
              {label}
            </span>
          </div>

          <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)] mt-1">
            {dep && ret ? `${dep} → ${ret}` : dep ?? '—'} {year ? `· ${year}` : ''}
          </p>

          <div className="hairline-brass w-12 my-5 opacity-50" />

          <div className="text-[13px] text-[var(--color-text-secondary)] leading-relaxed">
            {trip.origin && <span>From {trip.origin}</span>}
            {trip.origin && trip.travelers ? <span className="mx-2 text-[var(--color-text-tertiary)]">·</span> : null}
            {trip.travelers && (
              <span>
                {trip.travelers} traveler{trip.travelers > 1 ? 's' : ''}
              </span>
            )}
            {trip.budget ? (
              <>
                <span className="mx-2 text-[var(--color-text-tertiary)]">·</span>
                <span>~${trip.budget.toLocaleString()}</span>
              </>
            ) : null}
          </div>

          <span
            className="
              absolute right-7 bottom-6
              font-[family-name:var(--font-display)] text-2xl text-[var(--color-violet-bright)]
              opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0
              transition-all duration-300
            "
            aria-hidden
          >
            →
          </span>
        </article>
      </Link>
    </motion.div>
  );
}
