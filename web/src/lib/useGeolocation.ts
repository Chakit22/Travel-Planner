'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface Geolocation {
  lat: number;
  lng: number;
  accuracy_m?: number;
}

export type GeolocationStatus = 'idle' | 'requesting' | 'live' | 'denied' | 'unavailable';

export function useGeolocation() {
  const [position, setPosition] = useState<Geolocation | null>(null);
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const watchIdRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setStatus('idle');
    setPosition(null);
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }
    setStatus('requesting');

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy,
        });
        setStatus('live');
      },
      (err) => {
        console.warn('[useGeolocation] error:', err.message);
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
        watchIdRef.current = null;
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return { position, status, start, stop };
}
