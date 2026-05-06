'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { Geolocation, GeolocationStatus } from '@/lib/useGeolocation';

interface Props {
  active: boolean;
  status: GeolocationStatus;
  position: Geolocation | null;
  onToggle: () => void;
}

export function CompanionToggle({ active, status, position, onToggle }: Props) {
  const isLive = active && status === 'live' && position !== null;
  const isRequesting = active && status === 'requesting';
  const isDenied = status === 'denied' || status === 'unavailable';

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`
        group relative inline-flex items-center gap-3 h-9 px-4 rounded-full
        border transition-all duration-300
        ${isLive
          ? 'border-[var(--color-violet-bright)]/60 bg-gradient-to-r from-[var(--color-violet-deep)]/30 via-[var(--color-violet-deep)]/15 to-transparent text-[var(--color-text-primary)] shadow-[0_0_24px_-4px_rgba(139,92,246,0.45)]'
          : 'border-[var(--color-ink-line)] bg-[var(--color-ink-vellum)] text-[var(--color-text-secondary)] hover:border-[var(--color-violet-bright)]/40 hover:text-[var(--color-text-primary)]'}
        ${isDenied ? 'border-[var(--color-danger)]/60' : ''}
      `}
    >
      <span className="relative flex items-center justify-center w-2.5 h-2.5">
        {isLive && (
          <>
            <span className="absolute inset-0 rounded-full bg-[var(--color-violet-bright)] beacon-ring" />
            <span className="absolute inset-0 rounded-full bg-[var(--color-violet-bright)] beacon-ring-delayed" />
          </>
        )}
        <span
          className={`
            relative block w-2 h-2 rounded-full transition-colors
            ${isLive
              ? 'bg-[var(--color-violet-bright)] beacon-ignite'
              : isRequesting
              ? 'bg-[var(--color-brass)] dot-pulse'
              : isDenied
              ? 'bg-[var(--color-danger)]'
              : 'bg-[var(--color-text-tertiary)]'}
          `}
        />
      </span>

      <span
        className={`
          font-[family-name:var(--font-display)] text-[13px] tracking-[-0.005em]
          ${isLive ? 'italic font-[400]' : 'font-[400]'}
        `}
      >
        {isLive ? 'Live · here now' : isRequesting ? 'Locating…' : isDenied ? 'Location off' : 'Planning mode'}
      </span>

      <AnimatePresence>
        {isLive && position && (
          <motion.span
            key="coords"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -4 }}
            className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.05em] text-[var(--color-brass-dim)] tabular-nums"
          >
            {position.lat.toFixed(2)} / {position.lng.toFixed(2)}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
