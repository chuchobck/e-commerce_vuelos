import { LogIn, Ticket } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { useAuth } from '@/features/auth';
import { routes } from '@/app/routes';
import { CheckoutSteps } from '@/features/checkout';
import { flightsApi, isApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { useAsync } from '@/shared/lib/useAsync';
import { Alert, Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';

const p = es.purchase;

/** Pantalla final de la compra (no es un paso): código de reserva y acceso a Mis viajes. */
export function CheckoutConfirmationPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const booking = useAsync(() => (user ? flightsApi.getBooking(id) : Promise.resolve(null)), [id, user?.id]);

  let content;
  if (!user) {
    content = (
      <EmptyState
        title={p.confirmationTitle}
        text={p.confirmationLoginText}
        icon={<LogIn className="size-8" />}
        action={
          <Button asChild>
            <Link to={routes.login(routes.checkoutConfirmation(id))}>{es.nav.login}</Link>
          </Button>
        }
      />
    );
  } else if (booking.status === 'loading' || booking.status === 'idle') {
    content = <LoadingState label={es.trip.loading} skeletons={1} />;
  } else if (booking.status === 'error') {
    content =
      isApiError(booking.error) && booking.error.status === 404 ? (
        <EmptyState
          title={es.trip.notFoundTitle}
          text={es.trip.notFoundText}
          icon={<Ticket className="size-8" />}
          action={
            <Button asChild>
              <Link to={routes.trips()}>{es.nav.trips}</Link>
            </Button>
          }
        />
      ) : (
        <ErrorState error={booking.error} onRetry={() => void booking.execute()} />
      );
  } else if (booking.data) {
    const data = booking.data;
    content = (
      <>
        <Alert variant="success" title={fmt(p.confirmationCode, { code: data.code })}>
          <p>{fmt(p.confirmationText, { email: data.contact.email })}</p>
        </Alert>
        <div className="flex flex-wrap gap-4">
          <Button asChild>
            <Link to={routes.trip(data.id)}>
              <Ticket aria-hidden="true" />
              {p.goToTrip}
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to={routes.trips()}>{es.nav.trips}</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <Page title={p.confirmationTitle} heading={p.confirmationHeading} width="narrow">
      <CheckoutSteps current={3} />
      {content}
    </Page>
  );
}
