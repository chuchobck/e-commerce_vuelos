import { ArrowLeft, CreditCard, Search, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { useAuth } from '@/app/providers/AuthProvider';
import { routes } from '@/app/routes';
import { CheckoutSteps, CheckoutSummary, HoldStatus, loadSelection, selectionTotal, useCheckoutHold } from '@/features/checkout';
import { apiConfig } from '@/shared/api';
import { es } from '@/shared/i18n';
import { Alert, Button, Card, CardTitle, EmptyState } from '@/shared/ui';

const p = es.purchase;

/** Paso 3: revisar y pagar. El pago simulado llega en F4; aquí se conservan resumen y temporizador. */
export function CheckoutPaymentPage() {
  const { session } = useAuth();
  const [selection] = useState(loadSelection);
  // En el paso 3 nunca se crea un hold: solo se recupera el del paso 2.
  const ready = apiConfig.usingMock && !!session && !!selection?.holdId;
  const { hold, active, statusProps } = useCheckoutHold(ready ? selection : null, { create: false });

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

  const searchAgain = (
    <Button asChild>
      <Link to={routes.results(selection.searchQuery)}>
        <Search aria-hidden="true" />
        {p.searchAgain}
      </Link>
    </Button>
  );

  return (
    <Page title={p.paymentTitle} heading={p.paymentHeading}>
      <CheckoutSteps current={2} />
      {!apiConfig.usingMock ? (
        <Alert variant="info" title={p.notConnectedTitle} action={backToDetails}>
          <p>{p.notConnectedText}</p>
        </Alert>
      ) : ready ? (
        <HoldStatus {...statusProps} searchAgain={searchAgain} />
      ) : (
        <Alert variant="warning" title={p.needsHoldTitle} action={backToDetails}>
          <p>{p.needsHoldText}</p>
        </Alert>
      )}

      <CheckoutSummary
        outbound={hold?.outbound ?? selection.outbound}
        inbound={hold?.inbound ?? selection.inbound}
        total={hold?.totalPrice ?? selectionTotal(selection)}
        held={active}
      />

      <Card className="flex flex-col gap-4">
        <CardTitle className="flex items-center gap-2">
          <CreditCard aria-hidden="true" className="size-6 text-primary" />
          {p.steps.payment}
        </CardTitle>
        <Alert variant="info">
          <p>{p.paymentPending}</p>
        </Alert>
      </Card>

      {ready ? <div>{backToDetails}</div> : null}
    </Page>
  );
}
