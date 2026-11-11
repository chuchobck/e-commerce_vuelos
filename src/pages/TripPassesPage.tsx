import { ArrowLeft, Printer, QrCode } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { useAuth } from '@/features/auth';
import { BoardingPassCard, MissingPasses, useBoardingPasses } from '@/features/checkin';
import { TripFallback, TripTabs, useBooking } from '@/features/trips';
import { es, fmt } from '@/shared/i18n';
import { bookingCheckIn } from '@/shared/lib/checkinStatus';
import { Alert, Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';

const t = es.aftersale.passes;

/**
 * Pases de abordar de una reserva, con su código QR y un botón para imprimir o guardar en PDF (la hoja de impresión
 * oculta el menú, las pestañas y los botones; ver las clases `print:`). Antes del check-in la API responde 200 con la lista
 * vacía: se explica, sin botón de imprimir (no habría nada que imprimir). Cada vuelo sin pase lleva una línea que dice por
 * qué (salió, el check-in cerró, aún no abre o falta hacerlo) y, si alguno está abierto, se lleva al check-in.
 */
export function TripPassesPage() {
  const { id = '' } = useParams();
  const { authorized } = useAuth();
  const trip = useBooking(id, authorized);
  const passes = useBoardingPasses(id, authorized);
  const booking = trip.booking;
  const segments = booking ? [booking.outbound, booking.inbound].flatMap((leg) => leg?.itinerary.segments ?? []) : [];

  let content;
  if (!booking) {
    content = <TripFallback state={trip} onRetry={() => void trip.refresh()} />;
  } else if (passes.status === 'loading') {
    content = <LoadingState label={es.a11y.loading} skeletons={2} />;
  } else if (booking.status === 'CANCELLED') {
    content = (
      <Alert variant="info">
        <p>{t.cancelled}</p>
      </Alert>
    );
  } else if (!passes.passes) {
    content = <ErrorState error={passes.error} onRetry={() => void passes.refresh()} />;
  } else if (passes.passes.length === 0) {
    content = (
      <>
        <EmptyState title={t.emptyTitle} text={t.emptyText} icon={<QrCode className="size-8" />} />
        <MissingPasses checkIn={bookingCheckIn(booking, passes.passes)} bookingId={booking.id} />
      </>
    );
  } else {
    const nameOf = (passengerId: string) => {
      const p = booking.passengers.find((x) => x.id === passengerId);
      return p ? `${p.firstName} ${p.lastName}` : passengerId;
    };
    const order = booking.passengers.map((p) => p.id);
    const sorted = [...passes.passes].sort((a, b) => order.indexOf(a.passengerId) - order.indexOf(b.passengerId));
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
        <MissingPasses checkIn={bookingCheckIn(booking, passes.passes)} bookingId={booking.id} />
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
