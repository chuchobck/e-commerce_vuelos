import { RefreshCw, Search, Ticket } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { useAuth } from '@/features/auth';
import { countTrips, TripCard, TripFilters, tripsFor, useTrips, useTripExtras, type TripFilter } from '@/features/trips';
import { errorMessage } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { toIsoDate, today } from '@/shared/lib/dates';
import { Alert, Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';

const t = es.trips;
const l = es.aftersale.list;

const EMPTY: Record<TripFilter, { title: string; text: string }> = {
  upcoming: { title: l.emptyUpcomingTitle, text: l.emptyUpcomingText },
  past: { title: l.emptyPastTitle, text: l.emptyPastText },
  cancelled: { title: l.emptyCancelledTitle, text: l.emptyCancelledText },
};

/**
 * Lista de viajes del usuario. La ruta exige sesión (RequireAuth). Pagina por cursor ("Cargar más") y filtra en el
 * cliente: Próximos (el más cercano primero), Pasados y Cancelados (el más reciente primero).
 */
export function TripsPage() {
  const { authorized } = useAuth();
  const trips = useTrips(authorized);
  const [filter, setFilter] = useState<TripFilter>('upcoming');
  const todayIso = toIsoDate(today());

  const counts = useMemo(() => countTrips(trips.items, todayIso), [trips.items, todayIso]);
  const visible = useMemo(() => tripsFor(trips.items, filter, todayIso), [trips.items, filter, todayIso]);
  const extras = useTripExtras(visible, authorized);

  let content;
  if (trips.status === 'loading') {
    content = <LoadingState label={t.loading} skeletons={2} />;
  } else if (trips.status === 'error') {
    content = <ErrorState error={trips.error} onRetry={trips.reload} />;
  } else if (trips.items.length === 0) {
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
      <>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TripFilters value={filter} onChange={setFilter} counts={counts} />
          <Button variant="ghost" onClick={trips.reload}>
            <RefreshCw aria-hidden="true" />
            {l.refresh}
          </Button>
        </div>

        <p role="status" className="text-sm text-muted">
          {fmt(l.shown, { count: visible.length, total: trips.items.length })}
        </p>

        {visible.length === 0 ? (
          <EmptyState
            title={EMPTY[filter].title}
            text={trips.hasMore ? l.emptyFilteredMore : EMPTY[filter].text}
            icon={<Ticket className="size-8" />}
            headingLevel="h2"
            action={
              filter === 'upcoming' && !trips.hasMore ? (
                <Button asChild>
                  <Link to={routes.search()}>
                    <Search aria-hidden="true" />
                    {es.common.searchFlights}
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul aria-label={t.listLabel} className="flex flex-col gap-4">
            {visible.map((trip) => (
              <li key={trip.id}>
                <TripCard trip={trip} extra={extras[trip.id]} />
              </li>
            ))}
          </ul>
        )}

        {trips.error ? (
          <Alert variant="error" live="assertive" title={es.states.errorTitle}>
            <p>{errorMessage(trips.error)}</p>
          </Alert>
        ) : null}

        {trips.hasMore ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted">{l.moreHint}</p>
            <Button variant="secondary" onClick={trips.loadMore} loading={trips.loadingMore} loadingText={l.loadingMore}>
              {l.loadMore}
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <Page title={t.pageTitle} heading={t.heading}>
      {content}
    </Page>
  );
}
