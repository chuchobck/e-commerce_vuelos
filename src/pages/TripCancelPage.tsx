import { ArrowLeft, Ban } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { useAuth } from '@/app/providers/AuthProvider';
import { routes } from '@/app/routes';
import { TripFallback } from '@/features/trips';
import { errorMessage, flightsApi } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatUSD } from '@/shared/lib/format';
import { useAsync } from '@/shared/lib/useAsync';
import { Alert, Button, Card, toast, TripSummary } from '@/shared/ui';

const t = es.trip;

/** Cancelación de un viaje. La propia pantalla es la confirmación: explica la consecuencia antes de actuar. */
export function TripCancelPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const trip = useAsync(() => flightsApi.getBooking(id), [id]);
  const [cancelling, setCancelling] = useState(false);
  const booking = trip.status === 'success' ? trip.data : null;

  const cancel = async (bookingId: string) => {
    setCancelling(true);
    try {
      const updated = await flightsApi.cancelBooking(bookingId, session?.token);
      toast({ title: fmt(t.cancelled, { code: updated.code }), variant: 'success' });
      navigate(routes.trip(updated.id), { replace: true });
    } catch (error) {
      toast({ title: errorMessage(error), variant: 'error' });
      setCancelling(false);
    }
  };

  const backToTrip = (
    <Button asChild variant="secondary">
      <Link to={routes.trip(id)}>
        <ArrowLeft aria-hidden="true" />
        {booking?.status === 'CANCELLED' ? t.backToTrip : t.cancelKeep}
      </Link>
    </Button>
  );

  return (
    <Page
      title={booking ? `${t.cancelTitle} ${booking.code}` : t.cancelTitle}
      heading={booking ? fmt(t.cancelHeading, { code: booking.code }) : t.cancelTitle}
      width="narrow"
    >
      {!booking ? (
        <TripFallback state={trip} onRetry={() => void trip.execute()} />
      ) : (
        <>
          <Card className="flex flex-col gap-6">
            <TripSummary outbound={booking.outbound} inbound={booking.inbound} />
            <p className="flex flex-col">
              <span className="text-sm text-muted">{t.total}</span>
              <span className="text-2xl font-bold tabular-nums">{formatUSD(booking.totalPaid)}</span>
            </p>
          </Card>
          {booking.status === 'CANCELLED' ? (
            <Alert variant="info">
              <p>{t.alreadyCancelled}</p>
            </Alert>
          ) : (
            <Alert variant="warning">
              <p>{t.cancelText}</p>
            </Alert>
          )}
          <div className="flex flex-wrap gap-4">
            {booking.status !== 'CANCELLED' ? (
              <Button variant="danger" loading={cancelling} onClick={() => void cancel(booking.id)}>
                <Ban aria-hidden="true" />
                {t.cancelConfirm}
              </Button>
            ) : null}
            {backToTrip}
          </div>
        </>
      )}
    </Page>
  );
}
