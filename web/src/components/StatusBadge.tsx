'use client';

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'approved' || status === 'completed'
      ? 'border-[var(--color-brass-dim)] text-[var(--color-brass)]'
      : status === 'draft'
      ? 'border-[var(--color-violet-bright)]/50 text-[var(--color-violet-glow)]'
      : 'border-[var(--color-ink-line)] text-[var(--color-text-tertiary)]';

  return (
    <span
      className={`inline-flex items-center h-5 px-2 rounded-full border font-[family-name:var(--font-mono)] text-[8.5px] uppercase tracking-[0.22em] ${tone}`}
    >
      {status}
    </span>
  );
}
