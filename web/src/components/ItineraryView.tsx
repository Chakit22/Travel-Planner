'use client';

import ReactMarkdown from 'react-markdown';

interface ItineraryViewProps {
  markdown: string;
  version: number;
}

export function ItineraryView({ markdown, version }: ItineraryViewProps) {
  return (
    <div className="p-7 overflow-y-auto">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--color-ink-line-soft)]">
        <div>
          <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.32em] text-[var(--color-brass-dim)] mb-1.5">
            Atlas · Itinerary
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] text-[var(--color-text-primary)]">
            Day-by-day plan
          </h2>
        </div>
        <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)] border border-[var(--color-ink-line)] px-2.5 py-1 rounded-full">
          v{version}
        </span>
      </div>

      <article className="atlas-prose">
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] mt-8 mb-3 first:mt-0 text-[var(--color-text-primary)]">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="font-[family-name:var(--font-display)] text-xl tracking-[-0.01em] mt-6 mb-2 text-[var(--color-text-primary)]">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="font-medium mt-4 mb-1.5 text-base text-[var(--color-text-primary)]">
                {children}
              </h3>
            ),
            p: ({ children }) => (
              <p className="leading-relaxed mb-3 text-[14px] text-[var(--color-text-secondary)]">
                {children}
              </p>
            ),
            table: ({ children }) => (
              <div className="overflow-x-auto mb-4 border border-[var(--color-ink-line)]">
                <table className="w-full text-sm border-collapse">{children}</table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-[var(--color-ink-vellum)] text-[var(--color-violet-glow)]">{children}</thead>
            ),
            th: ({ children }) => (
              <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[0.18em] font-[family-name:var(--font-mono)]">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2 border-b border-[var(--color-ink-line-soft)] text-[var(--color-text-secondary)]">
                {children}
              </td>
            ),
            hr: () => <hr className="my-6 border-[var(--color-ink-line-soft)]" />,
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
