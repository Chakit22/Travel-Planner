'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Suggestion, updateTrip } from '@/lib/api';

interface SuggestionBannerProps {
  tripId: string;
  suggestions: Suggestion[];
  onUpdate: () => void;
}

export function SuggestionBanner({ tripId, suggestions, onUpdate }: SuggestionBannerProps) {
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  if (!suggestions || suggestions.length === 0) return null;

  const handleAccept = async (index: number) => {
    setLoading(true);
    try {
      await updateTrip(tripId, { acceptSuggestion: index });
      onUpdate();
    } catch (err) {
      console.error('Accept failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async (index: number) => {
    setLoading(true);
    try {
      await updateTrip(tripId, { dismissSuggestion: index });
      onUpdate();
    } catch (err) {
      console.error('Dismiss failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {suggestions.map((suggestion, i) => (
        <motion.div
          key={`${suggestion.createdAt}-${i}`}
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="border border-[var(--color-brass-dim)]/40 bg-[var(--color-ink-vellum)] rounded-sm p-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--color-brass)]">
                Weather alert
              </p>
              <p className="text-[14px] text-[var(--color-text-primary)] mt-1.5 leading-relaxed">
                {suggestion.reason}
              </p>

              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={() => handleAccept(i)}
                  disabled={loading}
                  className="
                    h-7 px-3 rounded-full border border-[var(--color-success)]/60
                    text-[var(--color-success)] text-[10px] uppercase tracking-[0.2em] font-[family-name:var(--font-mono)]
                    hover:bg-[var(--color-success)]/10 transition-colors disabled:opacity-40
                  "
                >
                  Accept
                </button>
                <button
                  onClick={() => handleDismiss(i)}
                  disabled={loading}
                  className="
                    h-7 px-3 rounded-full border border-[var(--color-ink-line)]
                    text-[var(--color-text-tertiary)] text-[10px] uppercase tracking-[0.2em] font-[family-name:var(--font-mono)]
                    hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-40
                  "
                >
                  Dismiss
                </button>
                <button
                  onClick={() => setPreviewIdx(previewIdx === i ? null : i)}
                  className="
                    h-7 px-3 text-[10px] uppercase tracking-[0.2em] font-[family-name:var(--font-mono)]
                    text-[var(--color-violet-glow)] hover:text-[var(--color-violet-bright)] transition-colors
                  "
                >
                  {previewIdx === i ? 'Hide' : 'Preview'}
                </button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {previewIdx === i && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-[var(--color-ink-line-soft)]">
                  <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--color-brass-dim)] mb-2">
                    Suggested itinerary
                  </p>
                  <pre className="text-[12px] text-[var(--color-text-secondary)] whitespace-pre-wrap bg-[var(--color-ink-paper)] border border-[var(--color-ink-line-soft)] rounded-sm p-3 max-h-60 overflow-y-auto">
                    {suggestion.newItinerary.slice(0, 1000)}
                    {suggestion.newItinerary.length > 1000 ? '…' : ''}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
}
