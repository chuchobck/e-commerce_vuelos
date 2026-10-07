import { ArrowLeft, CalendarCheck, Ticket } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { useAuth } from '@/app/providers/AuthProvider';
import { BookingStatusBadge } from '@/features/trips';
import { TripSummary } from '@/features/results';
import { errorMessage, flightsApi, isApiError, type Booking } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatUSD } from '@/shared/lib/format';
import { useAsync } from '@/shared/lib/useAsync';
import { Button, Card, CardTitle, ConfirmDialog, EmptyState, ErrorState, LoadingState, toast } from '@/shared/ui';

const b = es.booking;

export function BookingPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const booking = useAsync(() => flightsApi.getBooking(id), [id]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const data = booking.data;
  const code = data?.code ?? id.toUpperCase();

  const cancel = async (current: Booking) => {
    setCancelling(true);
    try {
      const updated = await flightsApi.cancelBooking(current.id, session?.token);
      booking.setState({ status: 'success', data: updated, error: undefined });
      setConfirmOpen(false);
      toast({ title: fmt(b.cancelled, { code: updated.code }), variant: 'success' });
    } catch (error) {
      toast({ title: errorMessage(error), variant: 'error' });
    } finally {
      setCancelling(false);
    }
  };

  const backLink = (
    <Button asChild variant="ghost">
      <Link to="/mis-reservas">
        <ArrowLeft aria-hidden="true" />
        {b.backToList}
      </Link>
    </Button>
  );

  let content;
  if (booking.status === 'loading' || booking.status === 'idle') {
    content = <LoadingState label={b.loading} skeletons={2} />;
  } else if (booking.status === 'error') {
    content =
      isApiError(booking.error) && booking.error.status === 404 ? (
        <EmptyState title={b.notFoundTitle} text={b.notFoundText} icon={<Ticket className="size-8" />} action={backLink} />
      ) : (
        <ErrorState error={booking.error} onRetry={() => void booking.execute()} />
      );
  } else if (data) {
    content = (
      <>
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardTitle className="mb-6">{b.flight}</CardTitle>
            <TripSummary outbound={data.outbound} inbound={data.inbound} />
          </Card>
          <Card className="flex flex-col gap-4">
            <CardTitle>{b.total}</CardTitle>
            <p className="text-3xl font-bold tabular-nums">{formatUSD(data.totalPaid)}</p>
            <p className="text-muted">
              {b.contact}: {data.contact.email}
            </p>
            {data.status === 'CONFIRMED' ? (
              <Button asChild>
                <Link to="/check-in">
                  <CalendarCheck aria-hidden="true" />
                  {b.checkinCta}
                </Link>
              </Button>
            ) : null}
            {data.status !== 'CANCELLED' ? (
              <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
                {b.cancel}
              </Button>
            ) : null}
          </Card>
        </div>

        <Card>
          <CardTitle className="mb-6">{b.passengers}</CardTitle>
          <ul className="flex flex-col divide-y-2 divide-border">
            {data.passengers.map((pax) => (
              <li key={pax.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="flex flex-col">
                  <span className="font-bold">
                    {pax.firstName} {pax.lastName}
                  </span>
                  <span className="text-sm text-muted">
                    {b[`type${pax.type}`]} ·{' '}
                    {fmt(b.document, {
                      type: pax.documentType === 'CEDULA' ? es.auth.cedula : es.auth.passport,
                      number: pax.documentNumber,
                    })}
                  </span>
                </div>
                <span className="text-sm">
                  {pax.type === 'INF' ? b.infantSeat : pax.seat ? fmt(b.seat, { seat: pax.seat }) : b.seatAuto}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <div>{backLink}</div>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={fmt(b.cancelConfirmTitle, { code: data.code })}
          description={b.cancelConfirmText}
          confirmLabel={b.cancelConfirm}
          cancelLabel={b.cancelKeep}
          loading={cancelling}
          destructive
          onConfirm={() => void cancel(data)}
        />
      </>
    );
  }

  return (
    <Page
      title={`${b.pageTitle} ${code}`}
      heading={fmt(b.heading, { code })}
      aside={data ? <BookingStatusBadge status={data.status} /> : null}
    >
      {content}
    </Page>
  );
}
