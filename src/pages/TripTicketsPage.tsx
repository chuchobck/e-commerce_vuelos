import { ArrowLeft, Ticket } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { useAuth } from '@/features/auth';
import { TicketList, TripFallback, TripTabs, useBooking } from '@/features/trips';
import { flightsApi } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { useAsync } from '@/shared/lib/useAsync';
import { Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';

const t = es.aftersale.tickets;

/** Boletos de una reserva: uno por pasajero, con su número y el detalle de cada tramo (cupón). */
export function TripTicketsPage() {
  const { id = '' } = useParams();
  const { authorized } = useAuth();
  const trip = useBooking(id, authorized);
  const tickets = useAsync(() => authorized(() => flightsApi.getTickets(id)), [id]);
  const booking = trip.booking;

  let content;
  if (!booking) {
    content = <TripFallback state={trip} onRetry={() => void trip.refresh()} />;
  } else if (tickets.status === 'loading' || tickets.status === 'idle') {
    content = <LoadingState label={t.detailLoading} skeletons={2} />;
  } else if (tickets.status === 'error') {
    content = <ErrorState error={tickets.error} onRetry={() => void tickets.execute()} />;
  } else if (tickets.data.length === 0) {
    content = <EmptyState title={t.emptyTitle} text={t.empty} icon={<Ticket className="size-8" />} />;
  } else {
    content = <TicketList booking={booking} tickets={tickets.data} authorized={authorized} />;
  }

  return (
    <Page title={booking ? `${t.pageTitle} ${booking.code}` : t.pageTitle} heading={booking ? fmt(t.heading, { code: booking.code }) : t.pageTitle} lead={t.lead}>
      {booking ? <TripTabs bookingId={booking.id} current="tickets" /> : null}
      {content}
      <div>
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
