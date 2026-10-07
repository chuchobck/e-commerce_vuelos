import { ArrowLeft, Search, ShoppingCart } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { LoginForm, RegisterForm, useAuth } from '@/features/auth';
import {
  AccountBlock,
  checkout,
  CheckoutAside,
  CheckoutLayout,
  CheckoutSteps,
  HoldNotice,
  loadSelection,
  PassengersForm,
  useCheckout,
} from '@/features/checkout';
import { es, fmt } from '@/shared/i18n';
import { Button, EmptyState, toast } from '@/shared/ui';

const p = es.purchase;
const title = fmt(p.stepTitle, { current: 2, name: p.detailsTitle });

/**
 * Paso 2: cuenta y pasajeros. Sin sesión, ingresar o crear la cuenta ocurre aquí mismo (la
 * selección se conserva); con sesión se aparta el precio una sola vez y se piden los datos.
 */
export function CheckoutDetailsPage() {
  const { status, user, authorized } = useAuth();
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

  if (!selection) {
    return (
      <Page title={title} heading={p.detailsHeading}>
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

  const editing = state.step === 'held' || state.step === 'rejected';
  const searchAgain = () => navigate(routes.results(checkout.searchAgain() ?? selection.searchQuery));
  const cancel = async () => {
    const query = await checkout.cancel();
    toast({ title: p.cancelled, variant: 'success' });
    navigate(routes.results(query ?? selection.searchQuery));
  };

  return (
    <Page
      title={title}
      heading={
        <>
          <span className="sr-only">{fmt(p.stepOf, { current: 2, total: 3 })}. </span>
          {p.detailsHeading}
        </>
      }
    >
      <CheckoutSteps current={1} />
      <CheckoutLayout aside={<CheckoutAside selection={selection} state={state} onCancel={cancel} />}>
        {/* Mientras se restaura la sesión no se muestra nada: ni las opciones ni "Compras como" parpadean. */}
        {status === 'restoring' ? null : (
          <AccountBlock
            email={user?.email}
            loginForm={<LoginForm idPrefix="checkout-login" onSuccess={(u) => toast({ title: fmt(es.auth.welcome, { email: u.email }), variant: 'success' })} />}
            registerForm={<RegisterForm idPrefix="checkout-register" onSuccess={(u) => toast({ title: fmt(es.auth.registered, { email: u.email }), variant: 'success' })} />}
          />
        )}
        {status === 'authenticated' ? <HoldNotice state={state} onSearchAgain={searchAgain} onRetryHold={start} /> : null}

        {editing && status === 'authenticated' ? (
          <section aria-labelledby="passengers-heading" className="flex flex-col gap-4">
            <h2 id="passengers-heading" className="text-2xl">
              {p.passengersTitle}
            </h2>
            <PassengersForm
              selection={selection}
              draft={checkout.passengersDraft()}
              accountEmail={user?.email}
              rejected={state.step === 'held' ? state.passengerErrors : []}
              onDraft={(passengers) => checkout.setPassengers(passengers, false)}
              onDone={(passengers) => {
                checkout.setPassengers(passengers, true);
                navigate(routes.checkoutPayment());
              }}
            />
          </section>
        ) : null}

        <div>
          <Button asChild variant="ghost">
            <Link to={routes.results(selection.searchQuery)}>
              <ArrowLeft aria-hidden="true" />
              {p.backToResults}
            </Link>
          </Button>
        </div>
      </CheckoutLayout>
    </Page>
  );
}
