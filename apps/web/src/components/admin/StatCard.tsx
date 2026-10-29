import { FlapText, Skeleton } from '../ui';
import { useChangeTick } from './useChangeTick';

export interface StatCardProps {
  label: string;
  value: number | null;
  sublabel?: string;
}

/** One cell of the stat strip. The value is set in flap digits and lights up when a new snapshot changes it. */
export function StatCard({ label, value, sublabel }: StatCardProps) {
  const tick = useChangeTick(value);
  return (
    <div className="relative flex min-w-0 flex-col gap-3 bg-slat p-4 sm:p-5">
      {tick > 0 && <span key={tick} className="animate-row-lit pointer-events-none absolute inset-0" />}
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{label}</p>
      {value === null ? (
        <>
          <Skeleton className="h-10 w-24" />
          <span className="sr-only">Loading</span>
        </>
      ) : (
        <p className="tabular-nums">
          <FlapText text={value.toLocaleString()} a11y="inline" minCells={3} className="text-[2rem] sm:text-[2.5rem]" />
        </p>
      )}
      <p className="min-h-5 text-sm text-dim">{value !== null ? sublabel : null}</p>
    </div>
  );
}
