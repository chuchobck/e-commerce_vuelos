import { ArrowLeft, CalendarCheck, Printer, QrCode } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { useAuth } from '@/features/auth';
import { BoardingPassCard } from '@/features/checkin';
import { TripFallback, TripTabs, useBooking } from '@/features/trips';
import { flightsApi, isApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { useAsync } from '@/shared/lib/useAsync';
import { Alert, Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';

const t = es.aftersale.passes;

/**
 * Pases de abordar de una reserva, con su código QR y un botón para imprimir o guardar en PDF (la hoja de impresión
 * oculta el menú, las pestañas y los botones; ver las clases `print:`). Antes del check-in la API responde 200 con la lista
 * vacía: se explica y se lleva al check-in, sin botón de imprimir (no habría nada que imprimir).
 */
export function TripPassesPage() {
  const { id = '' } = useParams();
  const { authorized } = useAuth();
  const trip = useBooking(id, authorized);
  const passes = useAsync(() => authorized(() => flightsApi.getBoardingPasses(id)), [id]);
  const booking = trip.booking;

  // La API real responde 200 con la lista vacía antes del check-in (no un error); un 409/404 también se trata como "aún no".
  const notYet =
    (passes.status === 'success' && passes.data.length === 0) ||
    (passes.status === 'error' && isApiError(passes.error) && (passes.error.status === 409 || passes.error.status === 404));
  const segments = booking ? [booking.outbound, booking.inbound].flatMap((leg) => leg?.itinerary.segments ?? []) : [];

  let content;
  if (!booking) {
    content = <TripFallback state={trip} onRetry={() => void trip.refresh()} />;
  } else if (passes.status === 'loading' || passes.status === 'idle') {
    content = <LoadingState label={es.a11y.loading} skeletons={2} />;
  } else if (booking.status === 'CANCELLED') {
    content = (
      <Alert variant="info">
        <p>{t.cancelled}</p>
      </Alert>
    );
  } else if (notYet) {
    content = (
      <EmptyState
        title={t.emptyTitle}
        text={t.emptyText}
        icon={<QrCode className="size-8" />}
        action={
          <Button asChild>
            <Link to={routes.tripCheckIn(booking.id)}>
              <CalendarCheck aria-hidden="true" />
              {t.goCheckIn}
            </Link>
          </Button>
        }
      />
    );
  } else if (passes.status === 'error') {
    content = <ErrorState error={passes.error} onRetry={() => void passes.execute()} />;
  } else {
    const nameOf = (passengerId: string) => {
      const p = booking.passengers.find((x) => x.id === passengerId);
      return p ? `${p.firstName} ${p.lastName}` : passengerId;
    };
    const order = booking.passengers.map((p) => p.id);
    const sorted = [...passes.data].sort((a, b) => order.indexOf(a.passengerId) - order.indexOf(b.passengerId));
    content = (
      <>
        <div className="flex flex-col items-start gap-2 print:hidden">
          <Button onClick={() => window.print()}>
            <Printer aria-hidden="true" />
            {t.print}
          </Button>
          <p className="text-sm text-muted">{t.printHint}</p>
        </div>
        <ul aria-label={t.listLabel} className="flex flex-col gap-6">
          {sorted.map((pass) => (
            <li key={`${pass.passengerId}-${pass.segmentId}`}>
              <BoardingPassCard pass={pass} passengerName={nameOf(pass.passengerId)} segment={segments.find((s) => s.id === pass.segmentId)} />
            </li>
          ))}
        </ul>
        {booking.passengers.some((p) => p.type === 'INFANT') ? <p className="text-sm text-muted">{t.infantNote}</p> : null}
      </>
    );
  }

  return (
    <Page title={booking ? `${t.pageTitle} ${booking.code}` : t.pageTitle} heading={booking ? fmt(t.heading, { code: booking.code }) : t.pageTitle} lead={t.lead}>
      {booking ? <TripTabs bookingId={booking.id} current="passes" /> : null}
      {content}
      <div className="print:hidden">
        <Button asChild variant="ghost">
          <Link to={routes.trip(id)}>
            <ArrowLeft aria-hidden="true" />
            {es.trip.backToTrip}
          </Link>
        </Button>
      </div>
    </Page>
  );
}
