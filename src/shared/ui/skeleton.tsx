import { cn } from '@/shared/lib/cn';

/** Bloque de carga decorativo. El estado se anuncia con <LoadingState>, no con el esqueleto. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded bg-border motion-reduce:animate-none motion-reduce:opacity-70', className)}
    />
  );
}
