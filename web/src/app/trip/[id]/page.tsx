'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getTrip,
  getTrips,
  createTrip,
  updateTrip,
  deleteTrip,
  type Trip,
} from '@/lib/api';
import { ChatPanel } from '@/components/ChatPanel';
import { ItineraryView } from '@/components/ItineraryView';
import { SuggestionBanner } from '@/components/SuggestionBanner';

const STORAGE_KEY = 'atlas_user_id';

type TabType = 'chat' | 'itinerary';

export default function TripPage() {
  const params = useParams();
  const router = useRouter();
  const tripId = params.id as string;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [creating, setCreating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      router.push('/login');
      return;
    }
    setUserId(stored);
    setAuthChecked(true);
  }, [router]);

  const loadTrip = useCallback(async () => {
    try {
      const data = await getTrip(tripId);
      setTrip(data);
    } catch {
      router.push('/');
    }
    setLoading(false);
  }, [tripId, router]);

  const loadTrips = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getTrips(userId);
      setTrips(data.reverse());
    } catch {}
  }, [userId]);

  useEffect(() => {
    if (!authChecked) return;
    loadTrip();
  }, [loadTrip, authChecked]);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const handleApprove = async () => {
    if (!trip) return;
    try {
      const updated = await updateTrip(trip.id, { status: 'approved' });
      setTrip(updated);
    } catch (err) {
      console.error('Approve failed:', err);
    }
  };

  const handleDelete = async () => {
    if (!trip) return;
    if (!confirm('Delete this trip? This cannot be undone.')) return;
    try {
      await deleteTrip(trip.id);
      router.push('/');
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleNewTrip = async () => {
    if (!userId || creating) return;
    setCreating(true);
    try {
      const newTrip = await createTrip(userId);
      router.push(`/trip/${newTrip.id}`);
    } catch (err) {
      console.error('Create trip failed:', err);
    } finally {
      setCreating(false);
    }
  };

  if (!authChecked || loading || !userId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.32em] text-[var(--color-text-tertiary)]">
          Loading trip…
        </p>
      </div>
    );
  }

  if (!trip) return null;

  const statusTone =
    trip.status === 'approved' || trip.status === 'completed'
      ? 'border-[var(--color-brass-dim)] text-[var(--color-brass)]'
      : trip.status === 'draft'
      ? 'border-[var(--color-violet-bright)]/50 text-[var(--color-violet-glow)]'
      : 'border-[var(--color-ink-line)] text-[var(--color-text-tertiary)]';

  return (
    <div className="flex-1 flex overflow-hidden min-h-0">
      {/* ─── Left Sidebar (logbook) ───────────────────────────────── */}
      <aside
        className={`shrink-0 flex flex-col border-r border-[var(--color-ink-line-soft)] bg-[var(--color-ink-paper)] transition-all duration-200 overflow-hidden ${
          sidebarOpen ? 'w-60' : 'w-0'
        }`}
      >
        <div className="p-4 border-b border-[var(--color-ink-line-soft)] shrink-0">
          <button
            onClick={handleNewTrip}
            disabled={creating}
            className="
              w-full h-9 rounded-full
              border border-[var(--color-brass-dim)] bg-transparent
              text-[var(--color-brass)] text-[10px] uppercase tracking-[0.22em] font-[family-name:var(--font-mono)]
              hover:bg-[var(--color-brass)]/10 hover:border-[var(--color-brass)]
              transition-all duration-200
              disabled:opacity-30
            "
          >
            {creating ? 'Charting…' : '+ New trip'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto chat-scroll py-2">
          {trips.map((t) => (
            <button
              key={t.id}
              onClick={() => router.push(`/trip/${t.id}`)}
              className={`
                w-full text-left px-4 py-3 transition-colors group
                ${t.id === tripId
                  ? 'bg-[var(--color-ink-vellum)] border-l-2 border-[var(--color-violet-bright)]'
                  : 'border-l-2 border-transparent hover:bg-[var(--color-ink-vellum)]/40'}
              `}
            >
              <p className="font-[family-name:var(--font-display)] text-[15px] tracking-[-0.01em] text-[var(--color-text-primary)] truncate">
                {t.destination || 'Untitled'}
              </p>
              <p className="font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.2em] text-[var(--color-text-tertiary)] mt-0.5">
                {t.status}
              </p>
            </button>
          ))}
        </div>
      </aside>

      {/* ─── Center: Chat ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 border-r border-[var(--color-ink-line-soft)]">
        <div className="px-5 h-12 border-b border-[var(--color-ink-line-soft)] bg-[var(--color-ink-paper)] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="text-[var(--color-text-tertiary)] hover:text-[var(--color-violet-glow)] shrink-0 p-1"
              title={sidebarOpen ? 'Collapse logbook' : 'Expand logbook'}
              aria-label="Toggle sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <rect y="2" width="16" height="1.5" rx="0.5" />
                <rect y="7" width="16" height="1.5" rx="0.5" />
                <rect y="12" width="16" height="1.5" rx="0.5" />
              </svg>
            </button>
            <span className="font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.22em] text-[var(--color-text-tertiary)]">
              Atlas / Trips /
            </span>
            <h1 className="font-[family-name:var(--font-display)] text-[15px] tracking-[-0.01em] text-[var(--color-text-primary)] truncate">
              {trip.destination || 'New trip'}
            </h1>
            <span
              className={`
                inline-flex items-center h-5 px-2 rounded-full border
                font-[family-name:var(--font-mono)] text-[8.5px] uppercase tracking-[0.2em]
                ${statusTone}
              `}
            >
              {trip.status}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {trip.itinerary && trip.status === 'draft' && (
              <button
                onClick={handleApprove}
                className="
                  h-7 px-3 rounded-full border border-[var(--color-success)]/60
                  text-[var(--color-success)] text-[10px] uppercase tracking-[0.2em] font-[family-name:var(--font-mono)]
                  hover:bg-[var(--color-success)]/10 transition-colors
                "
              >
                Approve
              </button>
            )}
            <button
              onClick={handleDelete}
              className="
                h-7 px-3 rounded-full border border-transparent
                text-[var(--color-text-tertiary)] text-[10px] uppercase tracking-[0.2em] font-[family-name:var(--font-mono)]
                hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/40 transition-colors
              "
            >
              Delete
            </button>
          </div>
        </div>

        <div className="lg:hidden flex border-b border-[var(--color-ink-line-soft)] shrink-0">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-2.5 text-[10px] uppercase tracking-[0.22em] font-[family-name:var(--font-mono)] transition-colors ${
              activeTab === 'chat'
                ? 'text-[var(--color-violet-glow)] border-b border-[var(--color-violet-bright)]'
                : 'text-[var(--color-text-tertiary)]'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab('itinerary')}
            className={`flex-1 py-2.5 text-[10px] uppercase tracking-[0.22em] font-[family-name:var(--font-mono)] transition-colors ${
              activeTab === 'itinerary'
                ? 'text-[var(--color-violet-glow)] border-b border-[var(--color-violet-bright)]'
                : 'text-[var(--color-text-tertiary)]'
            }`}
          >
            Itinerary
          </button>
        </div>

        <div className={`flex-1 min-h-0 ${activeTab === 'chat' ? 'flex' : 'hidden lg:flex'} flex-col`}>
          <ChatPanel
            userId={userId}
            tripId={tripId}
            tripDestination={trip.destination}
            tripDepartureDate={trip.departureDate}
            tripReturnDate={trip.returnDate}
          />
        </div>
      </div>

      {/* ─── Right: Itinerary ───────────────────────────────────────── */}
      <aside
        className={`w-[440px] shrink-0 flex flex-col overflow-hidden bg-[var(--color-ink-paper)] ${
          activeTab === 'itinerary' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {trip.suggestions && trip.suggestions.length > 0 && (
          <div className="p-4 shrink-0">
            <SuggestionBanner
              tripId={trip.id}
              suggestions={trip.suggestions}
              onUpdate={loadTrip}
            />
          </div>
        )}
        <div className="flex-1 overflow-y-auto chat-scroll">
          {trip.itinerary ? (
            <ItineraryView markdown={trip.itinerary} version={trip.itineraryVersion} />
          ) : (
            <div className="flex items-center justify-center h-full p-8">
              <div className="text-center max-w-xs">
                <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.32em] text-[var(--color-brass-dim)] mb-4">
                  No itinerary yet
                </p>
                <p className="font-[family-name:var(--font-display)] text-2xl tracking-[-0.015em] text-[var(--color-text-primary)] mb-3">
                  Tell Atlas the where & when.
                </p>
                <p className="text-[var(--color-text-secondary)] text-[13px] leading-relaxed">
                  Once you confirm flights and a hotel, the day-by-day plan appears here.
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
