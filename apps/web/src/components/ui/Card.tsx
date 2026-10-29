import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type CardProps = HTMLAttributes<HTMLDivElement>;

/** A board panel: a slat field framed by one hairline rule. */
export function Card({ className, ...rest }: CardProps) {
  return <div className={cn('rounded-slat border border-rule bg-slat', className)} {...rest} />;
}
