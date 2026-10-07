import { Inbox, RefreshCw, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '@/shared/api';
import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Button } from './button';
import { Skeleton } from './skeleton';
import { Spinner } from './spinner';

/**
 * Estado de carga: texto anunciado con role="status" + esqueletos decorativos opcionales.
 */
export function LoadingState({
  label = es.a11y.loading,
  skeletons = 0,
  className,
}: {
  label?: string;
  skeletons?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <p role="status" className="flex items-center gap-2 font-bold text-muted">
        <Spinner />
        {label}
      </p>
      {Array.from({ length: skeletons }, (_, i) => (
        <Skeleton key={i} className="h-32 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
  icon,
  headingLevel = 'h2',
  className,
}: {
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  headingLevel?: 'h2' | 'h3';
  className?: string;
}) {
  const Heading = headingLevel;
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 rounded border-2 border-dashed border-input bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-full bg-primary-tint text-primary">
        {icon ?? <Inbox className="size-8" />}
      </span>
      <Heading className="text-xl">{title}</Heading>
      {text ? <p className="text-muted">{text}</p> : null}
      {action ? <div className="flex flex-wrap justify-center gap-4">{action}</div> : null}
    </div>
  );
}

/**
 * Estado de error con mensaje en lenguaje del usuario (qué pasó y qué hacer) y botón para reintentar.
 * role="alert" para que se anuncie al aparecer.
 */
export function ErrorState({
  error,
  title = es.states.errorTitle,
  onRetry,
  action,
  headingLevel = 'h2',
  className,
}: {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  action?: ReactNode;
  headingLevel?: 'h2' | 'h3';
  className?: string;
}) {
  const Heading = headingLevel;
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-4 rounded border-2 border-error bg-error-tint px-6 py-12 text-center', className)}
    >
      <XCircle aria-hidden="true" className="size-12 text-error" />
      <Heading className="text-xl">{title}</Heading>
      <p>{errorMessage(error)}</p>
      <div className="flex flex-wrap justify-center gap-4">
        {onRetry ? (
          <Button variant="primary" onClick={onRetry}>
            <RefreshCw aria-hidden="true" />
            {es.common.retry}
          </Button>
        ) : null}
        {action}
      </div>
    </div>
  );
}
