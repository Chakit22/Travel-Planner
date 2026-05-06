'use client';

import { motion } from 'framer-motion';
import type { AtlasMemory } from '@/lib/api';

interface Props {
  userName?: string;
  memory: AtlasMemory | null;
}

const headlineFor = (name: string | undefined, hasMemory: boolean): { lead: string; tail: string } => {
  if (!hasMemory) return { lead: name ? `Hello, ${name}` : 'Hello', tail: '.' };
  return { lead: name ? `Welcome back, ${name}` : 'Welcome back', tail: '.' };
};

const summarise = (memory: AtlasMemory | null): string => {
  if (!memory || (memory.pastTrips.length === 0 && memory.likes.length === 0)) {
    return "We haven't traveled together yet. Start a trip and I'll start remembering.";
  }
  const trips = memory.pastTrips.length;
  const topLikes = memory.likes.slice(0, 2).map((l) => l.item);
  const topDislikes = memory.dislikes.slice(0, 1).map((l) => l.item);
  const parts: string[] = [];
  if (trips > 0) {
    parts.push(`${trips} trip${trips === 1 ? '' : 's'} on file`);
  }
  if (topLikes.length > 0) {
    parts.push(`you lean toward ${topLikes.join(' and ')}`);
  }
  if (topDislikes.length > 0) {
    parts.push(`you steer clear of ${topDislikes[0]}`);
  }
  return parts.join('. ') + ". I'll keep that in mind.";
};

export function MemoryStrip({ userName, memory }: Props) {
  const hasMemory = !!memory && (memory.pastTrips.length > 0 || memory.likes.length > 0);
  const { lead, tail } = headlineFor(userName, hasMemory);
  const subhead = summarise(memory);

  const tripCount = memory?.pastTrips.length ?? 0;
  const tasteCount = (memory?.likes.length ?? 0) + (memory?.dislikes.length ?? 0);
  const recentDestinations = (memory?.pastTrips ?? [])
    .map((t) => t.destination)
    .filter((d): d is string => !!d)
    .slice(0, 3);

  return (
    <section className="relative px-8 md:px-12 py-14 border-b border-[var(--color-ink-line)] overflow-hidden">
      {/* Atmospheric violet glow behind headline */}
      <div
        aria-hidden
        className="absolute -top-20 left-1/4 w-[480px] h-[280px] rounded-full pointer-events-none"
        style={{
          background: 'var(--color-violet-deep)',
          filter: 'blur(120px)',
          opacity: 0.35,
        }}
      />
      {/* Decorative hairline on the right */}
      <div
        aria-hidden
        className="absolute top-1/2 right-0 w-[28%] h-px"
        style={{ background: 'var(--color-brass-dim)', opacity: 0.3 }}
      />

      <div className="relative max-w-5xl">
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.32em] text-[var(--color-brass-dim)] mb-5"
        >
          Atlas · Memory
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="font-[family-name:var(--font-display)] text-[clamp(2.5rem,5vw,4rem)] font-[300] tracking-[-0.025em] text-[var(--color-text-primary)] leading-[1.05]"
        >
          {lead}
          <span className="text-[var(--color-violet-bright)]">{tail}</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="mt-5 max-w-2xl text-[17px] leading-[1.7] text-[var(--color-text-secondary)]"
        >
          {subhead}
        </motion.p>

        {hasMemory && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-12 grid grid-cols-3 gap-12 max-w-3xl"
          >
            <Stat value={String(tripCount).padStart(2, '0')} label="Trips logged" divider />
            <Stat value={String(tasteCount).padStart(2, '0')} label="Taste notes" divider />
            <Stat
              value={recentDestinations.join(', ') || '—'}
              label="Recent"
              small
            />
          </motion.div>
        )}
      </div>
    </section>
  );
}

function Stat({
  value,
  label,
  divider,
  small,
}: {
  value: string;
  label: string;
  divider?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`relative ${divider ? 'before:content-[""] before:absolute before:right-[-1.5rem] before:top-2 before:bottom-2 before:w-px before:bg-[var(--color-ink-line)]' : ''}`}>
      <p
        className={`font-[family-name:var(--font-display)] font-[300] tracking-[-0.02em] text-[var(--color-text-primary)] leading-none ${
          small ? 'text-2xl' : 'text-5xl'
        }`}
      >
        {value}
      </p>
      <p className="mt-3 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
        {label}
      </p>
    </div>
  );
}
