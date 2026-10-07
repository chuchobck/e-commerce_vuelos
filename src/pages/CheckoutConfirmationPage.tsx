import { LogIn, Search, Ticket } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { useAuth } from '@/features/auth';
import { BookingCode, checkout, CheckoutSteps, purchaseNotice, useCheckout } from '@/features/checkout';
import { flightsApi, isApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { Alert, Button, Card, CardTitle, EmptyState, ErrorState, LoadingState, TripSummary } from '@/shared/ui';

const p = es.purchase;
const f = es.checkoutForms;
const title = p.confirmationTitle;

/**
 * Final de la compra (no es un paso): confirmada, en proceso (se sigue hasta el estado final) o
 * fallida. Se puede abrir por URL directa con una reserva del usuario (recargar, enlace): se lee la
 * reserva y se retoma el seguimiento. Una reserva ajena o inexistente da un 404 amable.
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
      isApiError(loadError) && (loadError.status === 404 || loadError.status === 400) ? (
        <EmptyState
          title={es.trip.notFoundTitle}
          text={es.trip.notFoundText}
          icon={<Ticket className="size-8" />}
          action={
            <div className="flex flex-wrap justify-center gap-4">
              <Button asChild>
                <Link to={routes.trips()}>{es.nav.trips}</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to={routes.search()}>{p.searchAnother}</Link>
              </Button>
            </div>
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
    const failed = current.step === 'failed';
    content = (
      <>
        {/* Región viva: lo que cambia (en proceso → confirmada) se anuncia sin mover el foco. */}
        <div aria-live="polite" className="flex flex-col gap-4">
          {current.step === 'confirmed' ? (
            <Alert variant="success" title={fmt(p.confirmationCode, { code: booking.code })}>
              <p>{fmt(p.confirmationText, { email: booking.passengers[0]?.email ?? '' })}</p>
            </Alert>
          ) : notice ? (
            <Alert variant={notice.tone} title={notice.title}>
              <p>{notice.text}</p>
            </Alert>
          ) : null}
          {current.step === 'processing' && !current.gaveUp ? <LoadingState label={es.trip.status[booking.status]} /> : null}
        </div>

        {failed ? null : <BookingCode code={booking.code} />}

        {failed ? null : (
          <Card className="flex flex-col gap-6">
            <CardTitle>{p.summaryTitle}</CardTitle>
            <TripSummary outbound={booking.outbound} inbound={booking.inbound} />
            {booking.tickets.length > 0 ? (
              <section aria-labelledby="tickets-heading" className="flex flex-col gap-2">
                <h3 id="tickets-heading" className="text-lg font-bold">
                  {f.ticketsTitle}
                </h3>
                <ul className="flex flex-col gap-1 tabular-nums">
                  {booking.tickets.map((t) => (
                    <li key={t.id}>{t.number ? fmt(f.ticketLine, { name: name(t.passengerId), number: t.number }) : fmt(f.ticketPending, { name: name(t.passengerId) })}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </Card>
        )}
        {current.step === 'confirmed' ? <p className="text-muted">{p.afterBooking}</p> : null}

        <div className="flex flex-wrap gap-4">
          {failed ? (
            <Button asChild>
              <Link to={routes.search()}>
                <Search aria-hidden="true" />
                {p.searchAgain}
              </Link>
            </Button>
          ) : (
            <Button asChild size="lg">
              <Link to={routes.trips()}>
                <Ticket aria-hidden="true" />
                {p.viewTrips}
              </Link>
            </Button>
          )}
          <Button asChild variant="secondary" size={failed ? 'md' : 'lg'}>
            <Link to={failed ? routes.trips() : routes.search()}>{failed ? es.nav.trips : p.searchAnother}</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <Page title={title} heading={p.confirmationHeading} width="narrow">
      <CheckoutSteps current={3} />
      {content}
    </Page>
  );
}
