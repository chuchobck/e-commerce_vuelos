import { ChevronRight, Search, Ticket } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { useAuth } from '@/app/providers/AuthProvider';
import { routes } from '@/app/routes';
import { BookingStatusBadge } from '@/features/trips';
import { flightsApi, isApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatLongDate, formatTime, formatMoney } from '@/shared/lib/format';
import { useAsync } from '@/shared/lib/useAsync';
import { Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';

const t = es.trips;

/** Lista de viajes del usuario. La ruta exige sesión (RequireAuth). */
export function TripsPage() {
  const { session, logout } = useAuth();
  const token = session?.token;
  const trips = useAsync(() => (token ? flightsApi.listBookings(token) : Promise.resolve([])), [token]);

  // Sesión vencida en el servidor: se cierra localmente y RequireAuth pide ingresar de nuevo.
  useEffect(() => {
    if (trips.status === 'error' && isApiError(trips.error) && trips.error.status === 401) logout();
  }, [trips.status, trips.error, logout]);

  let content;
  if (trips.status === 'loading' || trips.status === 'idle') {
    content = <LoadingState label={t.loading} skeletons={2} />;
  } else if (trips.status === 'error') {
    content = <ErrorState error={trips.error} onRetry={() => void trips.execute()} />;
  } else if (trips.data.length === 0) {
    content = (
      <EmptyState
        title={t.emptyTitle}
        text={t.emptyText}
        icon={<Ticket className="size-8" />}
        action={
          <Button asChild>
            <Link to={routes.search()}>
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
        {trips.data.map((bk) => {
          const first = bk.outbound.itinerary.segments[0];
          const last = bk.outbound.itinerary.segments[bk.outbound.itinerary.segments.length - 1];
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
                    {fmt(t.passengersCount, { count: bk.passengers.length })} · {formatMoney(bk.totalPaid)}
                  </p>
                  <div>
                    <BookingStatusBadge status={bk.status} />
                  </div>
                </div>
                <Button asChild variant="secondary">
                  <Link to={routes.trip(bk.id)}>
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
