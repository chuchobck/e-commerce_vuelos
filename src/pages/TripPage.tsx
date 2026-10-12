import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { useAuth } from '@/features/auth';
import { LiveFlightStatus } from '@/features/flight-status';
import { BookingStatusBadge, TripActions, TripFallback, TripTabs, useBooking } from '@/features/trips';
import type { Booking } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatMoney } from '@/shared/lib/format';
import { Alert, Button, Card, CardTitle, TripSummary } from '@/shared/ui';

const t = es.trip;
const flight = es.aftersale.flight;

/** Tramos del viaje (ida y vuelta, con sus escalas) para consultar el estado de cada vuelo. */
function legsOf(booking: Booking) {
  return [booking.outbound, booking.inbound].flatMap((leg) => leg?.itinerary.segments ?? []);
}

/** Estado de cada vuelo del viaje, con los datos de la reserva: el viajero no escribe el número de vuelo. */
function TripFlightStatus({ booking }: { booking: Booking }) {
  return (
    <section aria-labelledby="trip-status-title" className="flex flex-col gap-4">
      <h2 id="trip-status-title" className="text-2xl">
        {flight.title}
      </h2>
      {legsOf(booking).map((segment) => (
        <LiveFlightStatus key={segment.id} flightNumber={segment.flightNumber} date={segment.departureTime.slice(0, 10)} route={`${segment.origin} → ${segment.destination}`} />
      ))}
    </section>
  );
}

/** Detalle del viaje: centro de postventa (README, sección 4). */
export function TripPage() {
  const { id = '' } = useParams();
  const { authorized } = useAuth();
  const trip = useBooking(id, authorized);
  const data = trip.booking;
  const inProgress = data && ['PENDING', 'PENDING_PAYMENT', 'TICKET_ISSUING', 'CHANGE_PENDING', 'CANCELLATION_PENDING'].includes(data.status);

  return (
    <Page
      title={data ? `${t.pageTitle} ${data.code}` : t.pageTitle}
      heading={data ? fmt(t.heading, { code: data.code }) : t.pageTitle}
      aside={data ? <BookingStatusBadge status={data.status} /> : null}
    >
      {data ? (
        <>
          <TripTabs bookingId={data.id} current="summary" />

          {inProgress ? (
            <Alert
              variant="info"
              live="polite"
              title={t.status[data.status]}
              action={
                <Button variant="secondary" onClick={() => void trip.refresh()} loading={trip.refreshing} loadingText={es.aftersale.flight.refreshing}>
                  <RefreshCw aria-hidden="true" />
                  {es.aftersale.actions.refreshStatus}
                </Button>
              }
            >
              <p>{es.aftersale.actions.inProgress}</p>
            </Alert>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardTitle className="mb-6">{t.flight}</CardTitle>
              <TripSummary outbound={data.outbound} inbound={data.inbound} />
            </Card>
            <Card className="flex flex-col gap-4">
              <CardTitle>{t.total}</CardTitle>
              <p className="text-3xl font-bold tabular-nums">{formatMoney(data.total)}</p>
              <p className="text-muted">
                {t.contact}: {data.passengers[0]?.email}
              </p>
            </Card>
          </div>

          <TripActions booking={data} />

          {data.status !== 'CANCELLED' && data.status !== 'FAILED' ? <TripFlightStatus booking={data} /> : null}

          <Card>
            <CardTitle className="mb-6">{t.passengers}</CardTitle>
            <ul className="flex flex-col divide-y-2 divide-border">
              {data.passengers.map((pax) => {
                const bags = pax.extraBaggage.reduce((n, b) => n + b.quantity, 0);
                return (
                  <li key={pax.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold">
                        {pax.firstName} {pax.lastName}
                      </span>
                      <span className="text-sm text-muted">
                        {t[`type${pax.type}`]} ·{' '}
                        {fmt(t.document, {
                          type: pax.documentType === 'NATIONAL_ID' ? es.documents.cedula : es.documents.passport,
                          number: pax.documentNumber,
                        })}
                      </span>
                      {bags > 0 ? <span className="text-sm text-muted">{fmt(t.extraBags, { count: bags })}</span> : null}
                    </div>
                    <span className="text-sm">
                      {pax.type === 'INFANT' ? t.infantSeat : pax.seats[0] ? fmt(t.seat, { seat: pax.seats.map((s) => s.seatNumber).join(' · ') }) : t.seatAuto}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="print:hidden">
            <Button asChild variant="ghost">
              <Link to={routes.trips()}>
                <ArrowLeft aria-hidden="true" />
                {t.backToList}
              </Link>
            </Button>
          </div>
        </>
      ) : (
        <TripFallback state={trip} onRetry={() => void trip.refresh()} />
      )}
    </Page>
  );
}
