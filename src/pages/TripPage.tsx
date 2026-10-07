import { ArrowLeft, Ban, CalendarCheck, CalendarClock, Luggage, QrCode } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { checkInStatus } from '@/features/checkin';
import { FlightStatusCard } from '@/features/flight-status';
import { BookingStatusBadge, TripFallback } from '@/features/trips';
import { flightsApi, type Booking } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatUSD } from '@/shared/lib/format';
import { useAsync } from '@/shared/lib/useAsync';
import { Button, Card, CardTitle, ErrorState, LoadingState, TripSummary } from '@/shared/ui';

const t = es.trip;

/**
 * Check-in: enlace si la ventana está abierta; si no, botón deshabilitado con el motivo
 * (cuándo abre o que ya cerró) escrito al lado y asociado con aria-describedby.
 */
function CheckInAction({ booking }: { booking: Booking }) {
  const { available, reason } = checkInStatus(booking);
  if (available) {
    return (
      <Button asChild fullWidth>
        <Link to={routes.tripCheckIn(booking.id)}>
          <CalendarCheck aria-hidden="true" />
          {t.checkIn}
        </Link>
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Button fullWidth disabled aria-describedby="checkin-reason">
        <CalendarCheck aria-hidden="true" />
        {t.checkIn}
      </Button>
      <p id="checkin-reason" className="text-sm text-muted">
        {reason}
      </p>
    </div>
  );
}

/** Acciones de postventa disponibles según el estado de la reserva. */
function TripActions({ booking }: { booking: Booking }) {
  if (booking.status === 'CANCELLED') return null;
  const links = [
    booking.status === 'CHECKED_IN' ? { to: routes.tripPasses(booking.id), label: t.passes, icon: QrCode } : null,
    { to: routes.tripBaggage(booking.id), label: t.baggage, icon: Luggage },
    { to: routes.tripDateChange(booking.id), label: t.dateChange, icon: CalendarClock },
    { to: routes.tripCancel(booking.id), label: t.cancel, icon: Ban },
  ].filter((a) => a !== null);

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>{t.manageTitle}</CardTitle>
      <ul className="flex flex-col gap-2">
        {booking.status === 'CONFIRMED' ? (
          <li>
            <CheckInAction booking={booking} />
          </li>
        ) : null}
        {links.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Button asChild variant="secondary" fullWidth>
              <Link to={to}>
                <Icon aria-hidden="true" />
                {label}
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Estado del vuelo de ida con los datos del viaje: el viajero no tiene que escribir el número de vuelo. */
function TripFlightStatus({ booking }: { booking: Booking }) {
  const segment = booking.outbound.offer.segments[0];
  const date = segment.departureTime.slice(0, 10);
  const status = useAsync(() => flightsApi.getFlightStatus(segment.flightNumber, date), [segment.flightNumber, date]);

  return (
    <section aria-labelledby="trip-status-title" className="flex flex-col gap-4">
      <h2 id="trip-status-title" className="text-2xl">
        {t.flightStatusTitle}
      </h2>
      {status.status === 'success' ? (
        <FlightStatusCard status={status.data} />
      ) : status.status === 'error' ? (
        <ErrorState error={status.error} onRetry={() => void status.execute()} headingLevel="h3" />
      ) : (
        <LoadingState label={t.flightStatusLoading} />
      )}
    </section>
  );
}

/** Detalle del viaje: centro de postventa (README, sección 4). */
export function TripPage() {
  const { id = '' } = useParams();
  const trip = useAsync(() => flightsApi.getBooking(id), [id]);
  const data = trip.status === 'success' ? trip.data : null;

  return (
    <Page
      title={data ? `${t.pageTitle} ${data.code}` : t.pageTitle}
      heading={data ? fmt(t.heading, { code: data.code }) : t.pageTitle}
      aside={data ? <BookingStatusBadge status={data.status} /> : null}
    >
      {data ? (
        <>
          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardTitle className="mb-6">{t.flight}</CardTitle>
              <TripSummary outbound={data.outbound} inbound={data.inbound} />
            </Card>
            <Card className="flex flex-col gap-4">
              <CardTitle>{t.total}</CardTitle>
              <p className="text-3xl font-bold tabular-nums">{formatUSD(data.totalPaid)}</p>
              <p className="text-muted">
                {t.contact}: {data.contact.email}
              </p>
            </Card>
          </div>

          <TripActions booking={data} />

          {data.status !== 'CANCELLED' ? <TripFlightStatus booking={data} /> : null}

          <Card>
            <CardTitle className="mb-6">{t.passengers}</CardTitle>
            <ul className="flex flex-col divide-y-2 divide-border">
              {data.passengers.map((pax) => (
                <li key={pax.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="flex flex-col">
                    <span className="font-bold">
                      {pax.firstName} {pax.lastName}
                    </span>
                    <span className="text-sm text-muted">
                      {t[`type${pax.type}`]} ·{' '}
                      {fmt(t.document, {
                        type: pax.documentType === 'CEDULA' ? es.auth.cedula : es.auth.passport,
                        number: pax.documentNumber,
                      })}
                    </span>
                  </div>
                  <span className="text-sm">
                    {pax.type === 'INF' ? t.infantSeat : pax.seat ? fmt(t.seat, { seat: pax.seat }) : t.seatAuto}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <div>
            <Button asChild variant="ghost">
              <Link to={routes.trips()}>
                <ArrowLeft aria-hidden="true" />
                {t.backToList}
              </Link>
            </Button>
          </div>
        </>
      ) : (
        <TripFallback state={trip} onRetry={() => void trip.execute()} />
      )}
    </Page>
  );
}
