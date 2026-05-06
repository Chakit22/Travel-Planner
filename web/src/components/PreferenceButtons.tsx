'use client';

import { useState } from 'react';
import { savePreference } from '@/lib/api';

interface Props {
  userId: string;
  category: string;
  item: string;
  onSaved?: (sentiment: 'like' | 'dislike') => void;
}

type State = 'idle' | 'saving-like' | 'saving-dislike' | 'saved-like' | 'saved-dislike' | 'error';

export function PreferenceButtons({ userId, category, item, onSaved }: Props) {
  const [state, setState] = useState<State>('idle');

  async function handle(sentiment: 'like' | 'dislike') {
    if (state !== 'idle') return;
    setState(sentiment === 'like' ? 'saving-like' : 'saving-dislike');
    try {
      await savePreference({ userId, category, item, sentiment });
      setState(sentiment === 'like' ? 'saved-like' : 'saved-dislike');
      onSaved?.(sentiment);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 1600);
    }
  }

  const savedLike = state === 'saved-like';
  const savedDislike = state === 'saved-dislike';
  const anySaved = savedLike || savedDislike;

  return (
    <span className="inline-flex items-center gap-2 mt-2 mr-2">
      <button
        type="button"
        onClick={() => handle('like')}
        disabled={anySaved || state.startsWith('saving')}
        className={`
          inline-flex items-center gap-1.5 h-7 px-3 rounded-full
          border text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-[0.16em]
          transition-all duration-200
          ${savedLike
            ? 'border-[var(--color-violet-bright)] bg-[var(--color-violet-deep)]/40 text-[var(--color-violet-glow)]'
            : 'border-[var(--color-ink-line)] bg-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-violet-bright)]/60 hover:text-[var(--color-violet-glow)] hover:bg-[var(--color-violet-deep)]/15'}
          disabled:opacity-50 disabled:cursor-default
        `}
      >
        <span aria-hidden>↑</span>
        <span>{savedLike ? 'saved' : 'save'}</span>
      </button>
      <button
        type="button"
        onClick={() => handle('dislike')}
        disabled={anySaved || state.startsWith('saving')}
        className={`
          inline-flex items-center gap-1.5 h-7 px-3 rounded-full
          border text-[10px] font-[family-name:var(--font-mono)] uppercase tracking-[0.16em]
          transition-all duration-200
          ${savedDislike
            ? 'border-[var(--color-danger)]/70 bg-[var(--color-danger)]/15 text-[var(--color-danger)]'
            : 'border-[var(--color-ink-line)] bg-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-danger)]/50 hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10'}
          disabled:opacity-50 disabled:cursor-default
        `}
      >
        <span aria-hidden>↓</span>
        <span>{savedDislike ? 'noted' : 'avoid'}</span>
      </button>
      <span className="text-[var(--color-text-tertiary)] font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.16em]">
        {item}
      </span>
    </span>
  );
}
