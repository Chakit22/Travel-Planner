'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { streamAtlasChat, getChatHistory, type AtlasChatRequest } from '@/lib/api';
import { useGeolocation } from '@/lib/useGeolocation';
import { CompanionToggle } from './CompanionToggle';
import { PreferenceButtons } from './PreferenceButtons';
import { ToolStatusLine, type ToolEntry } from './ToolStatusLine';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  tools?: ToolEntry[];
}

interface ChatPanelProps {
  userId: string;
  tripId?: string;
  initialGreeting?: string;
  tripDestination?: string | null;
  tripDepartureDate?: string | null; // YYYY-MM-DD
  tripReturnDate?: string | null; // YYYY-MM-DD
}

/**
 * Returns true if today's date is within [start, end] (inclusive).
 * Both bounds are YYYY-MM-DD strings; either may be null/missing.
 */
function isOnTripToday(start?: string | null, end?: string | null): boolean {
  if (!start || !end) return false;
  const today = new Date().toISOString().slice(0, 10);
  return today >= start && today <= end;
}

const PREF_LINK_RE = /\[([^\]]+)\]\(pref:([^:]+):([^:]+):(like|dislike)\)/g;

type Token =
  | { type: 'text'; value: string }
  | { type: 'pref'; category: string; item: string };

function tokenizeWithPrefs(content: string): Token[] {
  const out: Token[] = [];
  const matches: Array<{ start: number; end: number; category: string; item: string }> = [];

  PREF_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PREF_LINK_RE.exec(content)) !== null) {
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      category: m[2].trim(),
      item: m[3].trim(),
    });
  }

  let cursor = 0;
  const seen = new Set<string>();
  for (const match of matches) {
    if (cursor < match.start) {
      out.push({ type: 'text', value: content.slice(cursor, match.start) });
    }
    const key = `${match.category}::${match.item}`;
    if (!seen.has(key)) {
      out.push({ type: 'pref', category: match.category, item: match.item });
      seen.add(key);
    }
    cursor = match.end;
  }
  if (cursor < content.length) {
    out.push({ type: 'text', value: content.slice(cursor) });
  }
  if (out.length === 0) {
    out.push({ type: 'text', value: content });
  }
  return out;
}

export function ChatPanel({
  userId,
  tripId,
  initialGreeting,
  tripDestination,
  tripDepartureDate,
  tripReturnDate,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialGreeting
      ? [{ role: 'assistant', content: initialGreeting, ts: Date.now() }]
      : [],
  );
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [companionActive, setCompanionActive] = useState(false);
  const [autoCompanionAttempted, setAutoCompanionAttempted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { position, status, start, stop } = useGeolocation();

  const isOnTrip = useMemo(
    () => isOnTripToday(tripDepartureDate, tripReturnDate),
    [tripDepartureDate, tripReturnDate],
  );

  // If we're inside the trip's date range, flip companion mode on automatically
  // (once per mount, so the user can manually toggle off without us re-enabling).
  useEffect(() => {
    if (!isOnTrip || autoCompanionAttempted) return;
    setAutoCompanionAttempted(true);
    setCompanionActive(true);
    start();
  }, [isOnTrip, autoCompanionAttempted, start]);

  // Load existing transcript from DB when the trip page opens.
  useEffect(() => {
    let cancelled = false;
    if (!tripId) {
      setHistoryLoaded(true);
      return;
    }
    getChatHistory(tripId)
      .then(({ messages: history }) => {
        if (cancelled) return;
        if (history.length > 0) {
          const ts0 = Date.now() - history.length;
          setMessages(
            history
              .filter((m) => m.role === 'user' || m.role === 'assistant')
              .map((m, i) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
                ts: ts0 + i,
              })),
          );
        }
      })
      .catch(() => {
        // empty/missing convo is fine — leave initial state
      })
      .finally(() => {
        if (!cancelled) setHistoryLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, pending, scrollToBottom]);

  const handleToggleCompanion = useCallback(() => {
    if (companionActive) {
      stop();
      setCompanionActive(false);
      setToast('Planning mode');
      setTimeout(() => setToast(null), 1800);
    } else {
      start();
      setCompanionActive(true);
    }
  }, [companionActive, start, stop]);

  useEffect(() => {
    if (companionActive && (status === 'denied' || status === 'unavailable')) {
      setToast(
        status === 'denied'
          ? 'Atlas needs your location to walk with you.'
          : 'Location unavailable on this device.',
      );
      setCompanionActive(false);
      const t = setTimeout(() => setToast(null), 2600);
      return () => clearTimeout(t);
    }
  }, [status, companionActive]);

  const mode: 'planner' | 'companion' = useMemo(
    () => (companionActive && status === 'live' && position ? 'companion' : 'planner'),
    [companionActive, status, position],
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || pending) return;

    const userMsg: ChatMessage = { role: 'user', content: text, ts: Date.now() };
    const assistantTs = Date.now() + 1;

    setMessages((m) => [
      ...m,
      userMsg,
      { role: 'assistant', content: '', ts: assistantTs, tools: [] },
    ]);
    setInput('');
    setPending(true);

    const req: AtlasChatRequest = {
      userId,
      tripId,
      message: text,
      mode,
      geolocation: mode === 'companion' && position ? position : null,
    };

    const updateAssistant = (mutator: (msg: ChatMessage) => ChatMessage) => {
      setMessages((m) =>
        m.map((msg) => (msg.ts === assistantTs && msg.role === 'assistant' ? mutator(msg) : msg)),
      );
    };

    streamAtlasChat(req, (event) => {
      switch (event.type) {
        case 'tool_start':
          updateAssistant((msg) => ({
            ...msg,
            tools: [...(msg.tools ?? []), { name: event.name, status: 'loading' }],
          }));
          break;
        case 'tool_done':
          updateAssistant((msg) => {
            const tools = [...(msg.tools ?? [])];
            // Mark the most recent loading entry with this name as done.
            for (let i = tools.length - 1; i >= 0; i--) {
              if (tools[i].name === event.name && tools[i].status === 'loading') {
                tools[i] = { ...tools[i], status: 'done' };
                break;
              }
            }
            return { ...msg, tools };
          });
          break;
        case 'text_delta':
          updateAssistant((msg) => ({ ...msg, content: msg.content + event.text }));
          break;
        case 'error':
          updateAssistant((msg) => ({
            ...msg,
            content:
              msg.content +
              (msg.content ? '\n\n' : '') +
              (event.message || 'Atlas hit a snag. Try again in a moment.'),
          }));
          break;
        case 'done':
          setPending(false);
          break;
      }
    });
  }, [input, pending, userId, tripId, mode, position]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--color-ink-paper)] border-l border-[var(--color-ink-line-soft)] relative">
      <div className="h-14 px-6 flex items-center justify-between border-b border-[var(--color-ink-line-soft)] shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--color-brass-dim)]">
            Atlas · Navigator
          </span>
          {tripId && (
            <span className="font-[family-name:var(--font-mono)] text-[10px] tracking-[0.12em] text-[var(--color-text-tertiary)]">
              · trip {tripId.slice(0, 6)}
            </span>
          )}
        </div>
        <CompanionToggle
          active={companionActive}
          status={status}
          position={position}
          onToggle={handleToggleCompanion}
        />
      </div>

      {isOnTrip && tripDestination && (
        <div className="px-8 py-3 border-b border-[var(--color-ink-line-soft)] bg-gradient-to-r from-[var(--color-violet-deep)]/30 via-[var(--color-violet-deep)]/10 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <span className="relative flex items-center justify-center w-2.5 h-2.5">
              <span className="absolute inset-0 rounded-full bg-[var(--color-violet-bright)] beacon-ring" />
              <span className="block w-2 h-2 rounded-full bg-[var(--color-violet-bright)]" />
            </span>
            <p className="text-[13px] text-[var(--color-text-primary)]">
              You&apos;re in{' '}
              <span className="font-[family-name:var(--font-display)] italic text-[var(--color-violet-glow)]">
                {tripDestination}
              </span>{' '}
              right now. Atlas is here with you.
            </p>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto chat-scroll px-8 py-6 space-y-7">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[var(--color-text-tertiary)] text-[13px] text-center max-w-xs leading-relaxed">
              Atlas is listening.<br />
              Tell it where you&apos;re going — or flip on companion mode if you&apos;re already there.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <motion.div
            key={msg.ts + '-' + i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className={msg.role === 'user' ? 'flex justify-end' : 'block'}
          >
            {msg.role === 'user' ? (
              <div className="max-w-[78%]">
                <div className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)] mb-1.5 text-right">
                  You
                </div>
                <p className="text-[var(--color-text-secondary)] text-[15px] leading-[1.65] text-right">
                  {msg.content}
                </p>
              </div>
            ) : (
              <div>
                <div className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.22em] text-[var(--color-brass-dim)] mb-1.5">
                  Atlas
                </div>
                <div className="border-l border-[var(--color-violet-bright)]/40 pl-5">
                  {msg.tools && msg.tools.length > 0 && (
                    <div className="mb-3 space-y-0.5">
                      {msg.tools.map((t, idx) => (
                        <ToolStatusLine key={`${t.name}-${idx}`} entry={t} />
                      ))}
                    </div>
                  )}
                  {msg.content ? (
                    <div className="atlas-prose">
                      {tokenizeWithPrefs(msg.content).map((tok, idx) =>
                        tok.type === 'text' ? (
                          <ReactMarkdown key={idx}>{tok.value}</ReactMarkdown>
                        ) : (
                          <PreferenceButtons
                            key={idx}
                            userId={userId}
                            category={tok.category}
                            item={tok.item}
                          />
                        ),
                      )}
                    </div>
                  ) : (
                    pending &&
                    i === messages.length - 1 &&
                    (!msg.tools || msg.tools.length === 0) && (
                      <div className="flex gap-1.5 py-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-brass)] dot-pulse" />
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-[var(--color-brass)] dot-pulse"
                          style={{ animationDelay: '200ms' }}
                        />
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-[var(--color-brass)] dot-pulse"
                          style={{ animationDelay: '400ms' }}
                        />
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </motion.div>
        ))}

      </div>

      <div className="px-8 py-5 border-t border-[var(--color-ink-line-soft)] bg-[var(--color-ink-vellum)]/40 shrink-0">
        <div className="flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'companion'
                ? "I have an hour, I'm hungry…"
                : 'Where to next?'
            }
            rows={1}
            disabled={pending}
            className="
              flex-1 resize-none bg-transparent border-0 outline-none
              text-[15px] text-[var(--color-text-primary)] leading-[1.6]
              placeholder:text-[var(--color-text-tertiary)] placeholder:italic
              py-2
              disabled:opacity-50
            "
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={pending || !input.trim()}
            className="
              h-9 px-5 rounded-full
              border border-[var(--color-brass-dim)] bg-transparent
              text-[var(--color-brass)] text-[11px] uppercase tracking-[0.22em] font-[family-name:var(--font-mono)]
              hover:bg-[var(--color-brass)]/10 hover:border-[var(--color-brass)]
              transition-all duration-200
              disabled:opacity-30 disabled:cursor-not-allowed
            "
          >
            Send →
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 toast-in">
          <div className="bg-[var(--color-ink-paper)] border border-[var(--color-ink-line)] border-l-4 border-l-[var(--color-brass)] px-5 py-3 rounded-sm shadow-2xl shadow-black/60">
            <p className="text-[13px] text-[var(--color-text-primary)]">{toast}</p>
          </div>
        </div>
      )}
    </div>
  );
}
