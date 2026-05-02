'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { streamChat, getChatHistory, type ChatMessage, type SSEEvent } from '@/lib/api';

interface ChatPanelProps {
  tripId: string;
  onItinerary?: (text: string, version: number) => void;
}

export function ChatPanel({ tripId, onItinerary }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  // Load chat history on mount
  useEffect(() => {
    getChatHistory(tripId).then(({ messages: history }) => {
      if (history.length > 0) {
        setMessages(history);
      }
    }).catch(() => {
      // Silently fail — empty chat is fine
    });
  }, [tripId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsStreaming(true);

    let assistantText = '';

    const controller = streamChat(tripId, text, (event: SSEEvent) => {
      switch (event.type) {
        case 'message':
          assistantText += event.data.text;
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
              updated[lastIdx] = { role: 'assistant', content: assistantText };
            } else {
              updated.push({ role: 'assistant', content: assistantText });
            }
            return updated;
          });
          break;

        case 'status':
          setMessages((prev) => [
            ...prev,
            { role: 'status', content: `Searching...`, tool: event.data.tool },
          ]);
          break;

        case 'itinerary':
          onItinerary?.(event.data.text, event.data.version);
          break;

        case 'error':
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', content: event.data.error },
          ]);
          break;

        case 'done':
          setIsStreaming(false);
          assistantText = '';
          break;
      }
    });

    abortRef.current = controller;
  }, [input, isStreaming, tripId, onItinerary]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toolDisplayName = (tool: string) => {
    const names: Record<string, string> = {
      call_flight_agent: 'flights',
      call_hotel_agent: 'hotels',
      call_activity_agent: 'activities',
      call_itinerary_agent: 'itinerary',
      search_weather: 'weather',
      check_flight_status: 'flight status',
      search_events: 'events',
    };
    return names[tool] || tool;
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-navy/[0.03]">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 chat-scroll">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted text-sm text-center">
              Start planning your trip.<br />
              Tell Atlas where you want to go.
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === 'status') {
            return (
              <div key={i} className="flex justify-center">
                <span className="text-xs text-muted bg-cream-dark px-3 py-1 rounded-full">
                  Searching {toolDisplayName(msg.tool || '')}...
                </span>
              </div>
            );
          }

          const isUser = msg.role === 'user';
          return (
            <div
              key={i}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  isUser
                    ? 'bg-navy text-white rounded-br-md'
                    : 'bg-white text-charcoal border border-cream-dark rounded-bl-md shadow-sm'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          );
        })}

        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <div className="flex justify-start">
            <div className="bg-white border border-cream-dark rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-sand rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-sand rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-sand rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-cream-dark bg-white">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tell Atlas about your trip..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-cream-dark bg-cream px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy/30 placeholder:text-muted"
            disabled={isStreaming}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="px-4 py-2.5 bg-terracotta text-white rounded-xl text-sm font-medium hover:bg-terracotta-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
