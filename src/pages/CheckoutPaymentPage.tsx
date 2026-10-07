import { ArrowLeft, Search, ShoppingCart } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { useAuth } from '@/features/auth';
import {
  checkout,
  CheckoutSteps,
  CheckoutSummary,
  HoldPanel,
  holdOf,
  isDraftComplete,
  loadSelection,
  PaymentForm,
  selectionTotal,
  useCheckout,
} from '@/features/checkout';
import { es } from '@/shared/i18n';
import { Alert, Button, EmptyState } from '@/shared/ui';

const p = es.purchase;
const f = es.checkoutForms;

/** Paso 3: revisar y pagar (pago simulado). Al terminar lleva a la confirmación. */
export function CheckoutPaymentPage() {
  const { status, authorized } = useAuth();
  const navigate = useNavigate();
  const state = useCheckout();
  const [selection] = useState(loadSelection);
  const authorizedRef = useRef(authorized);
  authorizedRef.current = authorized;

  const start = () => void checkout.start({ authenticated: status === 'authenticated', authorized: (call) => authorizedRef.current(call) });
  useEffect(() => {
    if (status !== 'restoring') start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia la sesión
  }, [status]);

  // Al recargar en este paso, los pasajeros guardados siguen valiendo si están completos.
  useEffect(() => {
    if (state.step === 'held' && !state.passengersReady && selection && isDraftComplete(selection, checkout.passengersDraft())) {
      checkout.setPassengers(checkout.passengersDraft(), true);
    }
  }, [state, selection]);

  // Hay reserva (confirmada, en proceso o fallida): la confirmación la muestra.
  useEffect(() => {
    if (state.step === 'confirmed' || state.step === 'processing' || state.step === 'failed') {
      navigate(routes.checkoutConfirmation(state.booking.id), { replace: true });
    }
  }, [state, navigate]);

  const backToDetails = (
    <Button asChild variant="ghost">
      <Link to={routes.checkoutDetails()}>
        <ArrowLeft aria-hidden="true" />
        {p.backToDetails}
      </Link>
    </Button>
  );

  if (!selection) {
    return (
      <Page title={p.paymentTitle} heading={p.paymentHeading}>
        <EmptyState
          title={p.emptyTitle}
          text={p.emptyText}
          icon={<ShoppingCart className="size-8" />}
          action={
            <Button asChild>
              <Link to={routes.search()}>
                <Search aria-hidden="true" />
                {es.common.searchFlights}
              </Link>
            </Button>
          }
        />
      </Page>
    );
  }

  const hold = holdOf(state);
  const needsPassengers = state.step === 'selected' || (state.step === 'held' && !state.passengersReady);
  const canPay = (state.step === 'held' && state.passengersReady) || state.step === 'rejected' || state.step === 'paying';

  return (
    <Page title={p.paymentTitle} heading={p.paymentHeading}>
      <CheckoutSteps current={2} />
      <HoldPanel
        state={state}
        onSearchAgain={() => navigate(routes.results(checkout.searchAgain() ?? selection.searchQuery))}
        onRetryHold={start}
        onRetryPayment={() => void checkout.retryPayment()}
      />
      {needsPassengers ? (
        <Alert variant="warning" title={f.needsPassengersTitle} action={backToDetails}>
          <p>{f.needsPassengersText}</p>
        </Alert>
      ) : null}

      <CheckoutSummary outbound={selection.outbound} inbound={selection.inbound} total={hold?.lockedPrice ?? selectionTotal(selection)} held={!!hold} />

      {canPay && hold ? <PaymentForm amount={hold.lockedPrice} busy={state.step === 'paying'} onPay={(reference) => void checkout.pay(reference)} /> : null}

      {state.step === 'paying' ? null : <div>{backToDetails}</div>}
    </Page>
  );
}
