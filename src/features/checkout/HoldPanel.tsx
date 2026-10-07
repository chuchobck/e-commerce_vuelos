import { RotateCcw, Search, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { routes } from '@/app/routes';
import { es } from '@/shared/i18n';
import { Alert, Button, LoadingState, Timer, toast } from '@/shared/ui';
import { holdDeadline } from './holdClock';
import { checkout } from './instance';
import { holdOf, type CheckoutState } from './machine';
import { purchaseNotice } from './messages';

const p = es.purchase;

interface HoldPanelProps {
  state: CheckoutState;
  /** Volver a los resultados conservando la búsqueda (y lo escrito de los pasajeros). */
  onSearchAgain: () => void;
  onRetryHold: () => void;
  /** Error al pagar: reenviar el mismo pedido (misma clave). */
  onRetryPayment?: () => void;
}

/**
 * Estado del precio apartado: cargando, temporizador con el tiempo del SERVIDOR y avisos del
 * catálogo de la compra (purchaseNotice) con la acción que corresponde a cada uno.
 */
export function HoldPanel({ state, onSearchAgain, onRetryHold, onRetryPayment }: HoldPanelProps) {
  if (state.step === 'holding') return <LoadingState label={p.holding} />;
  const hold = holdOf(state);
  const notice = purchaseNotice(state);

  const searchAgain = (
    <Button onClick={onSearchAgain}>
      <Search aria-hidden="true" />
      {p.searchAgain}
    </Button>
  );
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
    action = searchAgain;
  } else if (state.step === 'error') {
    const retry = state.during === 'hold' ? onRetryHold : onRetryPayment;
    action = retry ? (
      <Button onClick={retry}>
        <RotateCcw aria-hidden="true" />
        {state.during === 'hold' ? es.common.retry : es.checkoutForms.retry}
      </Button>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-4">
      {hold && state.step !== 'paying' ? (
        <Timer
          deadline={holdDeadline(hold)}
          onExpire={() => void checkout.timeUp()}
          onExtend={state.step === 'held' ? () => void checkout.extend().then(() => toast({ title: p.extended, variant: 'success' })) : undefined}
        />
      ) : null}
      {notice ? (
        <Alert variant={notice.tone} live="assertive" title={notice.title} action={action}>
          <p>{notice.text}</p>
        </Alert>
      ) : null}
    </div>
  );
}
