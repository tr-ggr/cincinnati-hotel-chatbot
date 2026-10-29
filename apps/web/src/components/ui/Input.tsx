import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const fieldClasses =
  'w-full rounded-slat border border-rule-strong bg-board px-3.5 text-base text-flap placeholder:text-muted ' +
  'transition-colors hover:border-muted focus-visible:border-signal focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-signal/35 disabled:cursor-not-allowed disabled:bg-slat disabled:text-muted';

export function Input({ invalid, className, ...rest }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(fieldClasses, 'h-11', invalid && 'border-stop', className)}
      {...rest}
    />
  );
}
