import { ChevronRight, LogIn, Search, Ticket } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { SEARCH_ANCHOR_ID } from '@/app/layout/RootLayout';
import { useAuth } from '@/app/providers/AuthProvider';
import { BookingStatusBadge } from '@/features/bookings';
import { flightsApi, isApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatLongDate, formatTime, formatUSD } from '@/shared/lib/format';
import { useAsync } from '@/shared/lib/useAsync';
import { Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';

const t = es.bookings;

export function MyBookingsPage() {
  const { session, logout } = useAuth();
  const token = session?.token;
  const bookings = useAsync(() => (token ? flightsApi.listBookings(token) : Promise.resolve([])), [token]);

  // Sesión vencida en el servidor: se cierra localmente y se pide ingresar de nuevo.
  useEffect(() => {
    if (bookings.status === 'error' && isApiError(bookings.error) && bookings.error.status === 401) logout();
  }, [bookings.status, bookings.error, logout]);

  let content;
  if (!session) {
    content = (
      <EmptyState
        title={t.loginTitle}
        text={t.loginText}
        icon={<LogIn className="size-8" />}
        action={
          <>
            <Button asChild>
              <Link to="/ingresar" state={{ from: '/mis-reservas' }}>
                {es.nav.login}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/check-in">{es.nav.checkIn}</Link>
            </Button>
          </>
        }
      />
    );
  } else if (bookings.status === 'loading' || bookings.status === 'idle') {
    content = <LoadingState label={t.loading} skeletons={2} />;
  } else if (bookings.status === 'error') {
    content = <ErrorState error={bookings.error} onRetry={() => void bookings.execute()} />;
  } else if (bookings.data.length === 0) {
    content = (
      <EmptyState
        title={t.emptyTitle}
        text={t.emptyText}
        icon={<Ticket className="size-8" />}
        action={
          <Button asChild>
            <Link to={`/#${SEARCH_ANCHOR_ID}`}>
              <Search aria-hidden="true" />
              {es.common.searchFlights}
            </Link>
          </Button>
        }
      />
    );
  } else {
    content = (
      <ul aria-label={t.listLabel} className="flex flex-col gap-4">
        {bookings.data.map((bk) => {
          const first = bk.outbound.offer.segments[0];
          const last = bk.outbound.offer.segments[bk.outbound.offer.segments.length - 1];
          return (
            <li key={bk.id}>
              <article className="flex flex-wrap items-center justify-between gap-4 rounded border-2 border-border bg-surface p-6 shadow-card">
                <div className="flex flex-col gap-2">
                  <h2 className="text-xl">
                    {fmt(es.results.route, { origin: first.origin, destination: last.destination })}
                    <span className="font-normal text-muted"> · {bk.code}</span>
                  </h2>
                  <p className="text-muted">
                    {formatLongDate(first.departureTime)} · {formatTime(first.departureTime)} ·{' '}
                    {fmt(t.passengersCount, { count: bk.passengers.length })} · {formatUSD(bk.totalPaid)}
                  </p>
                  <div>
                    <BookingStatusBadge status={bk.status} />
                  </div>
                </div>
                <Button asChild variant="secondary">
                  <Link to={`/reserva/${bk.code}`}>
                    {fmt(t.view, { code: bk.code })}
                    <ChevronRight aria-hidden="true" />
                  </Link>
                </Button>
              </article>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Page title={t.pageTitle} heading={t.heading}>
      {content}
    </Page>
  );
}
