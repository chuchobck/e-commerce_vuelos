import { ArrowLeft, Search, ShoppingCart } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { useAuth } from '@/features/auth';
import {
  AccountBlock,
  checkout,
  CheckoutSteps,
  CheckoutSummary,
  HoldPanel,
  holdOf,
  loadSelection,
  PassengersForm,
  selectionTotal,
  useCheckout,
} from '@/features/checkout';
import { es } from '@/shared/i18n';
import { Button, ConfirmDialog, EmptyState, toast } from '@/shared/ui';

const p = es.purchase;

/**
 * Paso 2: cuenta y pasajeros. Sin sesión se pide ingresar aquí mismo (la selección se conserva);
 * con sesión se aparta el precio una sola vez y se piden los datos de quienes viajan.
 */
export function CheckoutDetailsPage() {
  const { status, user, authorized } = useAuth();
  const navigate = useNavigate();
  const state = useCheckout();
  const [selection] = useState(loadSelection);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const authorizedRef = useRef(authorized);
  authorizedRef.current = authorized;

  const start = () => void checkout.start({ authenticated: status === 'authenticated', authorized: (call) => authorizedRef.current(call) });
  useEffect(() => {
    if (status !== 'restoring') start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando cambia la sesión
  }, [status]);

  if (!selection) {
    return (
      <Page title={p.detailsTitle} heading={p.detailsHeading}>
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

  const here = routes.checkoutDetails();
  const hold = holdOf(state);
  const editing = state.step === 'held' || state.step === 'rejected';

  const searchAgain = () => navigate(routes.results(checkout.searchAgain() ?? selection.searchQuery));
  const cancel = async () => {
    setCancelling(true);
    const query = await checkout.cancel();
    setCancelling(false);
    setConfirmOpen(false);
    toast({ title: p.cancelled, variant: 'success' });
    navigate(routes.results(query ?? selection.searchQuery));
  };

  return (
    <Page title={p.detailsTitle} heading={p.detailsHeading}>
      <CheckoutSteps current={1} />
      {/* Mientras se restaura la sesión no se muestra nada: ni "Ingresa" ni "Compras como" parpadean. */}
      {status === 'restoring' ? null : <AccountBlock email={user?.email} loginHref={routes.login(here)} registerHref={routes.register(here)} />}
      {status === 'authenticated' ? <HoldPanel state={state} onSearchAgain={searchAgain} onRetryHold={start} /> : null}

      <CheckoutSummary outbound={selection.outbound} inbound={selection.inbound} total={hold?.lockedPrice ?? selectionTotal(selection)} held={!!hold}>
        {hold ? (
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            {p.cancelHold}
          </Button>
        ) : null}
      </CheckoutSummary>

      {editing && status === 'authenticated' ? (
        <PassengersForm
          selection={selection}
          draft={checkout.passengersDraft()}
          accountEmail={user?.email}
          rejected={state.step === 'held' ? state.passengerErrors : []}
          onDone={(passengers) => {
            checkout.setPassengers(passengers, true);
            navigate(routes.checkoutPayment());
          }}
        />
      ) : null}

      <div>
        <Button asChild variant="ghost">
          <Link to={routes.results(selection.searchQuery)}>
            <ArrowLeft aria-hidden="true" />
            {p.backToResults}
          </Link>
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={p.cancelHoldConfirmTitle}
        description={p.cancelHoldConfirmText}
        confirmLabel={p.cancelHoldConfirm}
        cancelLabel={p.cancelHoldKeep}
        loading={cancelling}
        destructive
        onConfirm={() => void cancel()}
      />
    </Page>
  );
}
