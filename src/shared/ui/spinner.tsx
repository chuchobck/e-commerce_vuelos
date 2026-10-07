import { Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

interface SpinnerProps {
  className?: string;
  /** Texto para lectores de pantalla; si se omite el spinner es decorativo. */
  label?: string;
}

export function Spinner({ className, label }: SpinnerProps) {
  return (
    <>
      <Loader2 aria-hidden="true" className={cn('size-6 animate-spin motion-reduce:animate-none', className)} />
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}
