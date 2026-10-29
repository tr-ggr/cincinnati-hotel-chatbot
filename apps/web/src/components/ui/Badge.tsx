import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

// Status flaps: reversed plates in board lettering.
const tones: Record<BadgeTone, string> = {
  neutral: 'bg-rule-strong text-flap',
  accent: 'bg-signal text-board',
  success: 'bg-go text-board',
  danger: 'bg-stop text-board',
};

export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-[2px] px-2 font-display text-sm font-extrabold uppercase tracking-wider',
        tones[tone],
        className,
      )}
      {...rest}
    />
  );
}
