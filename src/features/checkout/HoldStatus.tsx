import type { ReactNode } from 'react';
import { isApiError, type Hold } from '@/shared/api';
import { es } from '@/shared/i18n';
import type { AsyncState } from '@/shared/lib/useAsync';
import { Alert, ErrorState, LoadingState, Timer } from '@/shared/ui';

const p = es.purchase;

interface HoldStatusProps {
  state: AsyncState<Hold | null>;
  /** El temporizador llegó a cero en pantalla. */
  expired: boolean;
  onExpire: () => void;
  onExtend: (hold: Hold) => void;
  extending: boolean;
  onRetry: () => void;
  /** Acción para empezar de nuevo (volver a buscar). */
  searchAgain: ReactNode;
}

/** Estado del hold: cargando, error, vencido o temporizador de 15 minutos. */
export function HoldStatus({ state, expired, onExpire, onExtend, extending, onRetry, searchAgain }: HoldStatusProps) {
  if (state.status === 'idle' || state.status === 'loading') return <LoadingState label={p.holding} />;
  if (state.status === 'error') {
    // Con la API real la compra aún no está conectada (F4): se explica, no es un error del viajero.
    if (isApiError(state.error) && state.error.code === 'NOT_CONNECTED') {
      return (
        <Alert variant="info" title={p.notConnectedTitle} action={searchAgain}>
          <p>{p.notConnectedText}</p>
        </Alert>
      );
    }
    return isApiError(state.error) && state.error.status === 404 ? (
      <Alert variant="error" live="assertive" title={p.notFoundTitle} action={searchAgain}>
        <p>{p.notFoundText}</p>
      </Alert>
    ) : (
      <ErrorState error={state.error} onRetry={onRetry} />
    );
  }
  const hold = state.data;
  if (!hold) return null;
  if (expired || hold.status !== 'ACTIVE') {
    return (
      <Alert variant="error" live="assertive" title={p.holdExpiredTitle} action={searchAgain}>
        <p>{p.holdExpiredText}</p>
      </Alert>
    );
  }
  return <Timer expiresAt={hold.expiresAt} onExpire={onExpire} onExtend={() => onExtend(hold)} extending={extending} />;
}
