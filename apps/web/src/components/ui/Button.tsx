import type { ComponentPropsWithRef } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

/** React 19: `ref` is a plain prop and is forwarded to the <button>. */
export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

// Primary is the reversed signal plate; disabled drops to an unlit slat rather than a faded plate.
const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-signal text-board hover:bg-signal-hover disabled:bg-slat-2 disabled:text-muted disabled:hover:bg-slat-2',
  secondary: 'border border-rule-strong bg-slat text-flap hover:border-muted hover:bg-slat-2 disabled:text-muted',
  ghost: 'text-dim hover:bg-slat-2 hover:text-flap disabled:text-muted disabled:hover:bg-transparent',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 px-3 text-sm',
  md: 'h-11 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-slat font-semibold tracking-wide transition-colors',
        'disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
