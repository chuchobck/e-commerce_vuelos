import { ArrowLeft, ArrowRight, Search, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { useAuth } from '@/features/auth';
import { routes } from '@/app/routes';
import {
  AccountBlock,
  CheckoutSteps,
  CheckoutSummary,
  clearSelection,
  HoldStatus,
  loadSelection,
  selectionTotal,
  useCheckoutHold,
} from '@/features/checkout';
import { apiConfig, errorMessage, flightsApi, type Hold } from '@/shared/api';
import { es } from '@/shared/i18n';
import { Alert, Button, Card, CardTitle, ConfirmDialog, EmptyState, toast } from '@/shared/ui';

const p = es.purchase;

/**
 * Paso 2: cuenta y pasajeros. Sin sesión se pide ingresar aquí mismo (no se redirige);
 * con sesión se crea el hold y arranca el temporizador. El formulario de pasajeros llega en F4.
 */
export function CheckoutDetailsPage() {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const [selection] = useState(loadSelection);
  // Con la API real el hold aún no existe (F4): no se intenta.
  const { hold, active, statusProps } = useCheckoutHold(apiConfig.usingMock ? selection : null, { create: !!user });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

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

  const resultsHref = routes.results(selection.searchQuery);
  const here = routes.checkoutDetails();
  const searchAgain = (
    <Button asChild>
      <Link to={resultsHref}>
        <Search aria-hidden="true" />
        {p.searchAgain}
      </Link>
    </Button>
  );

  const cancel = async (h: Hold) => {
    setCancelling(true);
    try {
      await flightsApi.cancelHold(h.id);
      clearSelection();
      setConfirmOpen(false);
      toast({ title: p.cancelled, variant: 'success' });
      navigate(resultsHref);
    } catch (error) {
      toast({ title: errorMessage(error), variant: 'error' });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Page title={p.detailsTitle} heading={p.detailsHeading}>
      <CheckoutSteps current={1} />
      {apiConfig.usingMock && user ? <HoldStatus {...statusProps} searchAgain={searchAgain} /> : null}
      {/* Mientras se restaura la sesión no se muestra nada: ni "Ingresa" ni "Compras como" parpadean. */}
      {status === 'restoring' ? null : (
        <AccountBlock email={user?.email} loginHref={routes.login(here)} registerHref={routes.register(here)} />
      )}
      {!apiConfig.usingMock ? (
        // Con la API real, apartar el precio y pagar se conectan en F4: se explica en vez de fallar.
        <Alert variant="info" title={p.notConnectedTitle}>
          <p>{p.notConnectedText}</p>
        </Alert>
      ) : null}

      <CheckoutSummary
        outbound={selection.outbound}
        inbound={selection.inbound}
        total={hold?.lockedPrice ?? selectionTotal(selection)}
        held={active}
      >
        {active ? (
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            {p.cancelHold}
          </Button>
        ) : null}
      </CheckoutSummary>

      <Card className="flex flex-col gap-4">
        <CardTitle>{p.passengersTitle}</CardTitle>
        <Alert variant="info">
          <p>{p.passengersPending}</p>
        </Alert>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Button asChild variant="ghost">
          <Link to={resultsHref}>
            <ArrowLeft aria-hidden="true" />
            {p.backToResults}
          </Link>
        </Button>
        {active ? (
          <Button asChild size="lg">
            <Link to={routes.checkoutPayment()}>
              {p.continueToPayment}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </div>

      {hold ? (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={p.cancelHoldConfirmTitle}
          description={p.cancelHoldConfirmText}
          confirmLabel={p.cancelHoldConfirm}
          cancelLabel={p.cancelHoldKeep}
          loading={cancelling}
          destructive
          onConfirm={() => void cancel(hold)}
        />
      ) : null}
    </Page>
  );
}
