'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  getTrips,
  getUser,
  createTrip,
  fetchAtlasMemory,
  type User,
  type Trip,
  type AtlasMemory,
} from '@/lib/api';
import { TripCard } from '@/components/TripCard';
import { MemoryStrip } from '@/components/MemoryStrip';

const STORAGE_KEY = 'atlas_user_id';

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [memory, setMemory] = useState<AtlasMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadAll = useCallback(
    async (userId: string) => {
      try {
        const [userData, tripsData, memoryData] = await Promise.all([
          getUser(userId).catch(() => null),
          getTrips(userId),
          fetchAtlasMemory(userId).catch(() => null),
        ]);
        if (userData) setUser(userData);
        else setUser({ id: userId } as User);
        setTrips(tripsData.reverse());
        setMemory(memoryData);
      } catch {
        router.push('/login');
      }
      setLoading(false);
    },
    [router],
  );

  useEffect(() => {
    const storedId = localStorage.getItem(STORAGE_KEY);
    if (storedId) {
      loadAll(storedId);
    } else {
      router.push('/login');
    }
  }, [loadAll, router]);

  const handleNewTrip = async () => {
    if (!user || creating) return;
    setCreating(true);
    try {
      const trip = await createTrip(user.id);
      router.push(`/trip/${trip.id}`);
    } catch (err: any) {
      console.error('Create trip failed:', err);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.32em] text-[var(--color-text-tertiary)]">
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto chat-scroll">
      <MemoryStrip userName={user?.name?.split(' ')[0]} memory={memory} />

      <section className="px-8 md:px-12 py-12 max-w-6xl mx-auto w-full">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.32em] text-[var(--color-brass-dim)] mb-3">
              Logbook
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-[400] tracking-[-0.015em] text-[var(--color-text-primary)]">
              Recent expeditions
            </h2>
          </div>
          <button
            onClick={handleNewTrip}
            disabled={creating}
            className="
              group inline-flex items-center gap-2 px-5 h-10 rounded-full
              border border-[var(--color-brass-dim)] bg-transparent
              text-[var(--color-brass)] text-[11px] uppercase tracking-[0.22em] font-[family-name:var(--font-mono)]
              hover:bg-[var(--color-brass)]/10 hover:border-[var(--color-brass)]
              transition-all duration-200
              disabled:opacity-30
            "
          >
            <span>{creating ? 'Charting…' : 'New trip'}</span>
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </button>
        </div>

        {trips.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24 border border-dashed border-[var(--color-ink-line)] rounded-sm"
          >
            <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-text-primary)] mb-2">
              Where to next?
            </p>
            <p className="text-[var(--color-text-secondary)] text-sm">
              Tap &ldquo;New trip&rdquo; to start planning with Atlas.
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-[var(--color-ink-line)]">
            {trips.map((trip, i) => (
              <TripCard key={trip.id} trip={trip} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
