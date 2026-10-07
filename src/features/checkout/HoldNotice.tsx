import { Search, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { routes } from '@/app/routes';
import { isApiError } from '@/shared/api';
import { es } from '@/shared/i18n';
import { Alert, Button, LoadingState, RetryButton } from '@/shared/ui';
import type { CheckoutState } from './machine';
import { purchaseNotice } from './messages';

const p = es.purchase;

interface HoldNoticeProps {
  state: CheckoutState;
  /** Volver a los resultados conservando la búsqueda (y lo escrito de los pasajeros). */
  onSearchAgain: () => void;
  onRetryHold: () => void;
  /** Error al pagar: reenviar el mismo pedido (misma clave). */
  onRetryPayment?: () => void;
}

/**
 * Aviso del estado de la compra (catálogo `purchaseErrors`) con la acción que corresponde:
 * buscar de nuevo, ver Mis viajes o reintentar (con cuenta regresiva si la API pidió esperar).
 * Nunca es un callejón sin salida.
 */
export function HoldNotice({ state, onSearchAgain, onRetryHold, onRetryPayment }: HoldNoticeProps) {
  if (state.step === 'holding') return <LoadingState label={p.holding} />;
  const notice = purchaseNotice(state);
  if (!notice) return null;

  let action = null;
  if (state.step === 'expired' && state.reason === 'consumed') {
    action = (
      <Button asChild>
        <Link to={routes.trips()}>
          <Ticket aria-hidden="true" />
          {es.nav.trips}
        </Link>
      </Button>
    );
  } else if (state.step === 'expired' || state.step === 'unavailable') {
    action = (
      <Button onClick={onSearchAgain}>
        <Search aria-hidden="true" />
        {p.searchAgain}
      </Button>
    );
  } else if (state.step === 'error') {
    const retry = state.during === 'hold' ? onRetryHold : onRetryPayment;
    const wait = isApiError(state.error) && (state.error.status === 429 || state.error.status === 503) ? (state.error.retryAfter ?? 0) : 0;
    action = retry ? <RetryButton onRetry={retry} waitSeconds={wait} label={state.during === 'hold' ? es.common.retry : es.checkoutForms.retry} /> : null;
  }

  return (
    <Alert variant={notice.tone} live="assertive" title={notice.title} action={action}>
      <p>{notice.text}</p>
    </Alert>
  );
}
