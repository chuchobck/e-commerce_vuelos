import { Inbox, RefreshCw, XCircle } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { errorMessage, fieldErrorMessage, isApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
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
  const apiError = isApiError(error) ? error : undefined;
  // 400 con invalidParams: un mensaje en español por campo, sin repetir.
  const fieldMessages = [...new Set((apiError?.status === 400 ? apiError.fieldErrors : []).map(fieldErrorMessage))];
  // 429 y 503 con Retry-After: el botón se habilita cuando pasa el tiempo indicado.
  const waitSeconds = apiError && (apiError.status === 429 || apiError.status === 503) ? (apiError.retryAfter ?? 0) : 0;
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-4 rounded border-2 border-error bg-error-tint px-6 py-12 text-center', className)}
    >
      <XCircle aria-hidden="true" className="size-12 text-error" />
      <Heading className="text-xl">{title}</Heading>
      <p>{errorMessage(error)}</p>
      {fieldMessages.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 pl-6 text-left">
          {fieldMessages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap justify-center gap-4">
        {/* Reintentar no sirve si la función aún no está conectada a la API real. */}
        {onRetry && apiError?.code !== 'NOT_CONNECTED' ? <RetryButton onRetry={onRetry} waitSeconds={waitSeconds} /> : null}
        {action}
      </div>
    </div>
  );
}

/** Reintentar; si la API pidió esperar (Retry-After), se habilita al terminar la cuenta. */
function RetryButton({ onRetry, waitSeconds }: { onRetry: () => void; waitSeconds: number }) {
  const [left, setLeft] = useState(waitSeconds);
  useEffect(() => {
    setLeft(waitSeconds);
    if (waitSeconds <= 0) return;
    const id = setInterval(() => setLeft((s) => (s <= 1 ? (clearInterval(id), 0) : s - 1)), 1000);
    return () => clearInterval(id);
  }, [waitSeconds]);
  return (
    <div className="flex flex-col items-center gap-2">
      <Button variant="primary" onClick={onRetry} disabled={left > 0} aria-describedby={left > 0 ? 'retry-wait' : undefined}>
        <RefreshCw aria-hidden="true" />
        {es.common.retry}
      </Button>
      {left > 0 ? (
        <p id="retry-wait" className="text-sm tabular-nums">
          {fmt(es.errors.retryIn, { seconds: left })}
        </p>
      ) : null}
    </div>
  );
}
