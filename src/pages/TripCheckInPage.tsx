import { ArrowLeft, CalendarCheck, QrCode } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { useAuth } from '@/features/auth';
import { CheckInPassengers, notCheckedIn, useCheckIn } from '@/features/checkin';
import { TripFallback, useBooking } from '@/features/trips';
import { errorMessage, isApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { checkInAvailability } from '@/shared/lib/checkinStatus';
import { Alert, Button, Card, toast, TripSummary } from '@/shared/ui';

const c = es.aftersale.checkin;

/**
 * Check-in de un viaje propio: se hace por bookingId y para todos los pasajeros de la reserva. Confirmar pasajeros →
 * POST con Idempotency-Key → éxito y directo a "Pases de abordar". Si la API dice que no corresponde (fuera de ventana),
 * se explica cuándo abre y cierra con la regla de 48 h a 60 min (la API no manda la ventana en el error).
 */
export function TripCheckInPage() {
  const { id = '' } = useParams();
  const { authorized } = useAuth();
  const navigate = useNavigate();
  const trip = useBooking(id, authorized);
  const { state, submit } = useCheckIn(id, authorized);
  const booking = trip.booking;

  const confirm = async () => {
    const result = await submit();
    if (!result) return;
    if (notCheckedIn(result).length === 0) {
      toast({ title: c.successTitle, variant: 'success' });
      navigate(routes.tripPasses(id), { replace: true });
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
    content = <TripFallback state={trip} onRetry={() => void trip.refresh()} />;
  } else {
    const availability = checkInAvailability(booking);
    const windowError = state.status === 'error' && isApiError(state.error) && (state.error.status === 409 || state.error.status === 422);
    content = (
      <>
        <Card className="flex flex-col gap-6">
          <TripSummary outbound={booking.outbound} inbound={booking.inbound} />
          <p className="text-sm text-muted">{availability.windowText}</p>
        </Card>

        {!availability.available ? (
          <Alert variant="info" live="polite">
            <p>{availability.reason}</p>
          </Alert>
        ) : (
          <>
            <CheckInPassengers booking={booking} />
            <div>
              <Button size="lg" loading={state.status === 'loading'} loadingText={c.submitting} onClick={() => void confirm()}>
                <CalendarCheck aria-hidden="true" />
                {c.confirm}
              </Button>
            </div>
          </>
        )}

        {state.status === 'error' ? (
          <Alert variant="error" live="assertive" title={windowError ? c.serverWindowTitle : es.states.errorTitle}>
            <p>{errorMessage(state.error)}</p>
            {windowError ? <p>{availability.windowText}</p> : null}
          </Alert>
        ) : null}

        {state.status === 'done' && notCheckedIn(state.result).length > 0 ? (
          <Alert
            variant="warning"
            live="polite"
            title={c.partialTitle}
            action={
              <Button asChild variant="secondary">
                <Link to={routes.tripPasses(id)}>
                  <QrCode aria-hidden="true" />
                  {c.seePasses}
                </Link>
              </Button>
            }
          >
            <p>{c.partialText}</p>
          </Alert>
        ) : null}

        <div>{backToTrip}</div>
      </>
    );
  }

  return (
    <Page title={booking ? `${c.pageTitle} ${booking.code}` : c.pageTitle} heading={booking ? fmt(c.heading, { code: booking.code }) : c.pageTitle} lead={c.lead} width="narrow">
      {content}
    </Page>
  );
}
