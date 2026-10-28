import { ConciergeBell } from 'lucide-react';

export function Avatar() {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink"
      aria-hidden="true"
    >
      <ConciergeBell className="size-4" />
    </span>
  );
}
