import { EventEmitter } from 'node:events';

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const STATS_CHANGED = 'stats:changed';

export function emitStatsChanged(): void {
  emitter.emit(STATS_CHANGED);
}

/** Subscribes to stats changes; returns an unsubscribe function. */
export function onStatsChanged(fn: () => void): () => void {
  emitter.on(STATS_CHANGED, fn);
  return () => {
    emitter.off(STATS_CHANGED, fn);
  };
}
