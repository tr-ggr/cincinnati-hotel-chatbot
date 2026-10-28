import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import { Card, Skeleton } from '../ui';

export interface StatCardProps {
  label: string;
  value: number | null;
  icon: ComponentType<LucideProps>;
  sublabel?: string;
}

export function StatCard({ label, value, icon: Icon, sublabel }: StatCardProps) {
  return (
    <Card className="flex items-start gap-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted">{label}</p>
        {value === null ? (
          <>
            <Skeleton className="mt-1.5 h-8 w-16" />
            <span className="sr-only">Loading</span>
          </>
        ) : (
          <p className="mt-0.5 text-3xl font-semibold tabular-nums text-ink">{value.toLocaleString()}</p>
        )}
        {sublabel && value !== null && <p className="mt-0.5 text-xs text-muted">{sublabel}</p>}
      </div>
    </Card>
  );
}
