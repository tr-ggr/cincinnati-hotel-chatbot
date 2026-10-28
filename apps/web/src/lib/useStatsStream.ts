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

    const open = () => {
      const source = new EventSource(STATS_STREAM_URL);
      es = source;
      source.addEventListener('stats', (ev) => {
        if (es !== source) return;
        try {
          setStats(JSON.parse((ev as MessageEvent<string>).data) as StatsSnapshot);
          setError(null);
          failures = 0;
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
          setMode('live');
        } catch {
          // ignore malformed event
        }
      });
      source.addEventListener('error', () => {
        if (es !== source) return;
        if (timer) {
          // Recovery probe while polling failed: give up until the next poll tick.
          source.close();
          es = null;
          return;
        }
        if (source.readyState === EventSource.OPEN) return;
        failures += 1;
        if (failures >= MAX_FAILED_RECONNECTS) {
          source.close();
          es = null;
          startPolling();
        }
      });
    };

    const startPolling = () => {
      if (timer) return;
      setMode('polling');
      void refresh();
      timer = setInterval(() => {
        void refresh().then(() => {
          // Try to recover SSE: at most one reopen attempt per tick.
          if (!aliveRef.current || !timer || es || typeof EventSource === 'undefined') return;
          open();
        });
      }, POLL_INTERVAL_MS);
    };

    if (typeof EventSource === 'undefined') {
      startPolling();
    } else {
      open();
    }

    return () => {
      aliveRef.current = false;
      es?.close();
      if (timer) clearInterval(timer);
    };
  }, [refresh]);

  return { stats, mode, error, refresh };
}
