import type { HTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

/** Animated placeholder for loading states (spec F0 §4). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
