'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getTrip, getTrips, createTrip, updateTrip, deleteTrip, type Trip } from '@/lib/api';
import { ChatPanel } from '@/components/ChatPanel';
import { ItineraryView } from '@/components/ItineraryView';
import { SuggestionBanner } from '@/components/SuggestionBanner';
import { StatusBadge } from '@/components/StatusBadge';

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

  const userId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;

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
    loadTrip();
    loadTrips();
  }, [loadTrip, loadTrips]);

  const handleItinerary = useCallback((text: string, version: number) => {
    setTrip((prev) =>
      prev ? { ...prev, itinerary: text, itineraryVersion: version } : prev,
    );
    if (window.innerWidth < 1024) setActiveTab('itinerary');
  }, []);

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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted">Loading trip...</p>
      </div>
    );
  }

  if (!trip) return null;

  return (
    <div className="flex-1 flex overflow-hidden" style={{ height: 'calc(100vh - 60px)' }}>

      {/* ─── Left Sidebar ───────────────────────────────────────────── */}
      <div
        className={`shrink-0 flex flex-col border-r border-cream-dark bg-white transition-all duration-200 overflow-hidden ${
          sidebarOpen ? 'w-56' : 'w-0'
        }`}
      >
        <div className="p-3 border-b border-cream-dark shrink-0">
          <button
            onClick={handleNewTrip}
            disabled={creating}
            className="w-full py-2 bg-terracotta text-white rounded-lg text-sm font-medium hover:bg-terracotta-dark transition-colors disabled:opacity-50"
          >
            {creating ? 'Creating...' : '+ New Trip'}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {trips.map((t) => (
            <button
              key={t.id}
              onClick={() => router.push(`/trip/${t.id}`)}
              className={`w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-cream truncate ${
                t.id === tripId ? 'bg-cream text-navy font-medium' : 'text-charcoal'
              }`}
            >
              {t.destination || 'New Trip'}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Center: Chat ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-cream-dark">
        {/* Header */}
        <div className="px-4 py-3 border-b border-cream-dark bg-white shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="text-muted hover:text-navy shrink-0 p-1 rounded"
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect y="2" width="16" height="2" rx="1" />
                <rect y="7" width="16" height="2" rx="1" />
                <rect y="12" width="16" height="2" rx="1" />
              </svg>
            </button>
            <h1 className="font-[family-name:var(--font-display)] text-lg text-navy truncate">
              {trip.destination || 'New Trip'}
            </h1>
            <StatusBadge status={trip.status} />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {trip.itinerary && trip.status === 'draft' && (
              <button
                onClick={handleApprove}
                className="px-2.5 py-1 bg-green text-white text-xs rounded-lg hover:bg-green/90 transition-colors"
              >
                Approve
              </button>
            )}
            <button
              onClick={handleDelete}
              className="px-2.5 py-1 text-terracotta text-xs rounded-lg hover:bg-terracotta/10 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Mobile tab nav */}
        <div className="lg:hidden flex border-b border-cream-dark bg-white shrink-0">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
              activeTab === 'chat' ? 'text-navy border-b-2 border-navy' : 'text-muted'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setActiveTab('itinerary')}
            className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${
              activeTab === 'itinerary' ? 'text-navy border-b-2 border-navy' : 'text-muted'
            }`}
          >
            Itinerary
          </button>
        </div>

        <div className={`flex-1 min-h-0 ${activeTab === 'chat' ? 'flex' : 'hidden lg:flex'} flex-col`}>
          <ChatPanel tripId={tripId} onItinerary={handleItinerary} />
        </div>
      </div>

      {/* ─── Right: Itinerary ───────────────────────────────────────── */}
      <div
        className={`w-[420px] shrink-0 flex flex-col overflow-hidden ${
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
        <div className="flex-1 overflow-y-auto">
          {trip.itinerary ? (
            <ItineraryView markdown={trip.itinerary} version={trip.itineraryVersion} />
          ) : (
            <div className="flex items-center justify-center h-full p-6">
              <div className="text-center">
                <p className="font-[family-name:var(--font-display)] text-xl text-navy mb-2">
                  No itinerary yet
                </p>
                <p className="text-muted text-sm max-w-xs">
                  Chat with Atlas to plan your trip. Once you pick your flights and hotel, the itinerary will appear here.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
