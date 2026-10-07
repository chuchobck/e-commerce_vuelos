import { ArrowLeft, Ban, CalendarCheck, CalendarClock, Luggage, QrCode } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { BookingStatusBadge, TripFallback } from '@/features/trips';
import { flightsApi, type Booking } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatUSD } from '@/shared/lib/format';
import { useAsync } from '@/shared/lib/useAsync';
import { Button, Card, CardTitle, TripSummary } from '@/shared/ui';

const t = es.trip;

/** Acciones de postventa disponibles según el estado de la reserva. */
function TripActions({ booking }: { booking: Booking }) {
  if (booking.status === 'CANCELLED') return null;
  const actions = [
    booking.status === 'CONFIRMED' ? { to: routes.tripCheckIn(booking.id), label: t.checkIn, icon: CalendarCheck } : null,
    booking.status === 'CHECKED_IN' ? { to: routes.tripPasses(booking.id), label: t.passes, icon: QrCode } : null,
    { to: routes.tripBaggage(booking.id), label: t.baggage, icon: Luggage },
    { to: routes.tripDateChange(booking.id), label: t.dateChange, icon: CalendarClock },
    { to: routes.tripCancel(booking.id), label: t.cancel, icon: Ban },
  ].filter((a) => a !== null);

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>{t.manageTitle}</CardTitle>
      <ul className="flex flex-col gap-2">
        {actions.map(({ to, label, icon: Icon }, i) => (
          <li key={to}>
            <Button asChild variant={i === 0 ? 'primary' : 'secondary'} fullWidth>
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
