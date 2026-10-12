import { ArrowLeft, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { routes } from '@/app/routes';
import { isApiError } from '@/shared/api';
import { es } from '@/shared/i18n';
import { Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';

const t = es.trip;

/**
 * Lo que se ve mientras un viaje no está listo: cargando, no encontrado o error.
 * Una reserva ajena responde 404 en la API, así que se trata igual que una inexistente.
 */
export function TripFallback({ state, onRetry }: { state: { status: 'loading' | 'ready' | 'error'; error?: unknown }; onRetry: () => void }) {
  if (state.status === 'loading') return <LoadingState label={t.loading} skeletons={2} />;
  if (state.status !== 'error') return null;
  if (isApiError(state.error) && state.error.status === 404) {
    return (
      <EmptyState
        title={t.notFoundTitle}
        text={t.notFoundText}
        icon={<Ticket className="size-8" />}
        action={
          <Button asChild>
            <Link to={routes.trips()}>
              <ArrowLeft aria-hidden="true" />
              {t.backToList}
            </Link>
          </Button>
        }
      />
    );
  }
  return <ErrorState error={state.error} onRetry={onRetry} />;
}
