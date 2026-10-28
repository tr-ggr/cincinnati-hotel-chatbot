import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const fieldClasses =
  'w-full rounded-xl border border-line bg-surface px-3.5 text-base text-ink placeholder:text-muted ' +
  'transition-colors focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 ' +
  'focus-visible:outline-accent/40 disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-60';

export function Input({ invalid, className, ...rest }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(fieldClasses, 'h-10', invalid && 'border-red-500', className)}
      {...rest}
    />
  );
}
