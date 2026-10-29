import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...rest }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-[2px] bg-slat-2', className)} {...rest} />;
}
