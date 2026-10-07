import { LogIn, Search, Ticket } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { useAuth } from '@/features/auth';
import { checkout, CheckoutSteps, purchaseNotice, useCheckout } from '@/features/checkout';
import { flightsApi, isApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { Alert, Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';

const p = es.purchase;
const f = es.checkoutForms;

/**
 * Final de la compra (no es un paso): confirmada, en proceso (se sigue hasta el estado final) o
 * fallida. Al llegar de nuevo (recargar, enlace) se lee la reserva y se retoma el seguimiento.
 */
export function CheckoutConfirmationPage() {
  const { id = '' } = useParams();
  const { status, user, authorized } = useAuth();
  const state = useCheckout();
  const [loadError, setLoadError] = useState<unknown>(null);
  const authorizedRef = useRef(authorized);
  authorizedRef.current = authorized;
  const current = 'booking' in state && state.booking.id === id ? state : null;

  const load = () => {
    setLoadError(null);
    const call = <T,>(fn: () => Promise<T>) => authorizedRef.current(fn);
    call(() => flightsApi.getBooking(id))
      .then((booking) => checkout.follow(booking, call))
      .catch(setLoadError);
  };
  useEffect(() => {
    if (status === 'authenticated' && !current) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- al cambiar de reserva o de sesión
  }, [id, status]);

  let content;
  if (status === 'restoring') {
    content = <LoadingState label={es.session.restoring} />;
  } else if (!user) {
    content = (
      <EmptyState
        title={p.confirmationTitle}
        text={p.confirmationLoginText}
        icon={<LogIn className="size-8" />}
        action={
          <Button asChild>
            <Link to={routes.login(routes.checkoutConfirmation(id))}>{es.nav.login}</Link>
          </Button>
        }
      />
    );
  } else if (loadError) {
    content =
      isApiError(loadError) && loadError.status === 404 ? (
        <EmptyState
          title={es.trip.notFoundTitle}
          text={es.trip.notFoundText}
          icon={<Ticket className="size-8" />}
          action={
            <Button asChild>
              <Link to={routes.trips()}>{es.nav.trips}</Link>
            </Button>
          }
        />
      ) : (
        <ErrorState error={loadError} onRetry={load} />
      );
  } else if (!current) {
    content = <LoadingState label={es.trip.loading} skeletons={1} />;
  } else {
    const { booking } = current;
    const notice = purchaseNotice(current);
    const name = (passengerId: string) => {
      const pax = booking.passengers.find((x) => x.id === passengerId);
      return pax ? `${pax.firstName} ${pax.lastName}` : passengerId;
    };
    content = (
      <>
        {current.step === 'confirmed' ? (
          <Alert variant="success" live="polite" title={fmt(p.confirmationCode, { code: booking.code })}>
            <p>{fmt(p.confirmationText, { email: booking.passengers[0]?.email ?? '' })}</p>
          </Alert>
        ) : notice ? (
          <Alert variant={notice.tone} live="polite" title={notice.title}>
            <p>{notice.text}</p>
          </Alert>
        ) : null}
        {current.step === 'processing' && !current.gaveUp ? <LoadingState label={es.trip.status[booking.status]} /> : null}
        {booking.tickets.length > 0 && current.step !== 'failed' ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-xl">{f.ticketsTitle}</h2>
            <ul className="flex flex-col gap-1 tabular-nums">
              {booking.tickets.map((t) => (
                <li key={t.id}>{t.number ? fmt(f.ticketLine, { name: name(t.passengerId), number: t.number }) : fmt(f.ticketPending, { name: name(t.passengerId) })}</li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="flex flex-wrap gap-4">
          {current.step === 'failed' ? (
            <Button asChild>
              <Link to={routes.search()}>
                <Search aria-hidden="true" />
                {p.searchAgain}
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link to={routes.trip(booking.id)}>
                <Ticket aria-hidden="true" />
                {p.goToTrip}
              </Link>
            </Button>
          )}
          <Button asChild variant="secondary">
            <Link to={routes.trips()}>{es.nav.trips}</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <Page title={p.confirmationTitle} heading={p.confirmationHeading} width="narrow">
      <CheckoutSteps current={3} />
      {content}
    </Page>
  );
}
