import type { StatsMode } from '../../lib/useStatsStream';
import { cn } from '../../lib/cn';

const config: Record<StatsMode, { label: string; dot: string; text: string; pulse: boolean }> = {
  live: { label: 'Live', dot: 'bg-emerald-500', text: 'text-emerald-800', pulse: true },
  polling: { label: 'Polling', dot: 'bg-stone-400', text: 'text-ink-soft', pulse: false },
  connecting: { label: 'Connecting', dot: 'bg-amber-500', text: 'text-accent-ink', pulse: false },
};

export function LiveBadge({ mode }: { mode: StatsMode }) {
  const c = config[mode];
  return (
    <span
      role="status"
      className={cn('inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-sm font-medium', c.text)}
    >
      <span className="relative flex size-2.5" aria-hidden="true">
        {c.pulse && <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden', c.dot)} />}
        <span className={cn('relative inline-flex size-2.5 rounded-full', c.dot)} />
      </span>
      {c.label}
    </span>
  );
}
