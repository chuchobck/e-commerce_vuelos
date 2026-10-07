import { ArrowLeft, CalendarCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { useAuth } from '@/app/providers/AuthProvider';
import { routes } from '@/app/routes';
import { BoardingPassCard, checkInStatus } from '@/features/checkin';
import { TripFallback } from '@/features/trips';
import { flightsApi, type CheckInResult } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { useAsync } from '@/shared/lib/useAsync';
import { Alert, Button, Card, ErrorState, LoadingState, TripSummary } from '@/shared/ui';

const c = es.checkin;

type State = { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'success'; data: CheckInResult };

/** Check-in de un viaje propio: se hace por bookingId y para todos los pasajeros de la reserva. */
export function TripCheckInPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const trip = useAsync(() => flightsApi.getBooking(id), [id]);
  const [state, setState] = useState<State>({ status: 'idle' });
  const booking = trip.status === 'success' ? trip.data : null;

  const checkIn = async (bookingId: string) => {
    setState({ status: 'loading' });
    try {
      const data = await flightsApi.checkIn({ bookingId }, session?.token);
      setState({ status: 'success', data });
    } catch (error) {
      setState({ status: 'error', error });
    }
  };

  const backToTrip = (
    <Button asChild variant="ghost">
      <Link to={routes.trip(id)}>
        <ArrowLeft aria-hidden="true" />
        {es.trip.backToTrip}
      </Link>
    </Button>
  );

  let content;
  if (!booking) {
    content = <TripFallback state={trip} onRetry={() => void trip.execute()} />;
  } else if (state.status === 'success') {
    content = (
      <section aria-labelledby="checkin-passes" className="flex flex-col gap-4">
        <Alert variant="success" live="polite" title={c.successTitle}>
          <p>{c.successText}</p>
        </Alert>
        <h2 id="checkin-passes" className="text-2xl">
          {c.passesTitle}
        </h2>
        <ul className="flex flex-col gap-4">
          {state.data.boardingPasses.map((bp) => (
            <li key={bp.id}>
              <BoardingPassCard pass={bp} />
            </li>
          ))}
        </ul>
        <div>{backToTrip}</div>
      </section>
    );
  } else {
    const { available, reason } = checkInStatus(booking);
    content = (
      <>
        <Card className="flex flex-col gap-6">
          <TripSummary outbound={booking.outbound} inbound={booking.inbound} />
          {!available ? (
            <Alert variant="info">
              <p>{reason}</p>
            </Alert>
          ) : (
            <>
              <p className="text-muted">{c.passengersText}</p>
              <Button
                size="lg"
                loading={state.status === 'loading'}
                loadingText={c.submitting}
                onClick={() => void checkIn(booking.id)}
              >
                <CalendarCheck aria-hidden="true" />
                {c.submit}
              </Button>
            </>
          )}
        </Card>
        {state.status === 'loading' ? <LoadingState label={c.submitting} /> : null}
        {state.status === 'error' ? <ErrorState error={state.error} onRetry={() => void checkIn(booking.id)} /> : null}
        <div>{backToTrip}</div>
      </>
    );
  }

  return (
    <Page
      title={booking ? `${c.pageTitle} ${booking.code}` : c.pageTitle}
      heading={booking ? fmt(c.heading, { code: booking.code }) : c.pageTitle}
      lead={c.lead}
      width="narrow"
    >
      {content}
    </Page>
  );
}
