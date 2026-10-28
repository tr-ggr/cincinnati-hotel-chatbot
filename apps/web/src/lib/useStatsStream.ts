import { useCallback, useEffect, useRef, useState } from 'react';
import { getStats, STATS_STREAM_URL, type StatsSnapshot } from './api';

export type StatsMode = 'live' | 'polling' | 'connecting';

const MAX_FAILED_RECONNECTS = 2;
const POLL_INTERVAL_MS = 10_000;

export interface UseStatsStream {
  stats: StatsSnapshot | null;
  mode: StatsMode;
  error: Error | null;
  /** Re-fetch via GET /api/admin/stats right now (e.g. after an upload). */
  refresh: () => Promise<void>;
}

export function useStatsStream(): UseStatsStream {
  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  const [mode, setMode] = useState<StatsMode>('connecting');
  const [error, setError] = useState<Error | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const s = await getStats();
      if (!aliveRef.current) return;
      setStats(s);
      setError(null);
    } catch (e) {
      if (!aliveRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let failures = 0;

    const startPolling = () => {
      if (timer) return;
      setMode('polling');
      void refresh();
      timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    };

    if (typeof EventSource === 'undefined') {
      startPolling();
    } else {
      es = new EventSource(STATS_STREAM_URL);
      es.addEventListener('stats', (ev) => {
        try {
          setStats(JSON.parse((ev as MessageEvent<string>).data) as StatsSnapshot);
          setError(null);
          failures = 0;
          setMode('live');
        } catch {
          // ignore malformed event
        }
      });
      es.addEventListener('error', () => {
        if (!es || es.readyState === EventSource.OPEN) return;
        failures += 1;
        if (failures >= MAX_FAILED_RECONNECTS) {
          es.close();
          es = null;
          startPolling();
        }
      });
    }

    return () => {
      aliveRef.current = false;
      es?.close();
      if (timer) clearInterval(timer);
    };
  }, [refresh]);

  return { stats, mode, error, refresh };
}
