import type { TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { fieldClasses } from './Input';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ invalid, className, rows = 3, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(fieldClasses, 'resize-none py-2.5', invalid && 'border-stop', className)}
      {...rest}
    />
  );
}
