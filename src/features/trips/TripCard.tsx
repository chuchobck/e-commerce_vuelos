import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { routes } from '@/app/routes';
import { cityOf, type BookingSummary } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatLongDate, formatMoney, formatTime } from '@/shared/lib/format';
import { Badge, Button } from '@/shared/ui';
import { BookingStatusBadge } from './BookingStatusBadge';
import type { TripExtra } from './useTripDetails';

const t = es.aftersale.list;

interface TripCardProps {
  trip: BookingSummary;
  /** Número de vuelo y hora (la lista no los trae: llegan aparte y pueden faltar). */
  extra?: TripExtra;
}

/** Una reserva de la lista: ruta, fecha y hora, vuelo, estado, código y total. El nivel h2 asume que la página tiene un h1. */
export function TripCard({ trip, extra }: TripCardProps) {
  return (
    <article className="flex flex-wrap items-center justify-between gap-4 rounded border-2 border-border bg-surface p-6 shadow-card">
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="text-xl">
          {cityOf(trip.origin)} → {cityOf(trip.destination)}
          <span className="font-normal text-muted"> · {trip.code}</span>
        </h2>
        <p className="text-muted">
          {trip.departureDate ? formatLongDate(trip.departureDate) : null}
          {extra ? ` · ${formatTime(extra.departureTime)}` : ''}
          {extra ? ` · ${fmt(t.flight, { flight: extra.flights })}` : ''}
        </p>
        <p className="text-muted">
          {extra ? `${fmt(t.passengers, { count: extra.passengers })} · ` : ''}
          <span className="tabular-nums">{formatMoney(trip.total)}</span>
        </p>
        <div>{trip.status ? <BookingStatusBadge status={trip.status} /> : <Badge tone="neutral">{t.statusUnknown}</Badge>}</div>
      </div>
      <Button asChild variant="secondary">
        <Link to={routes.trip(trip.id)}>
          {fmt(es.trips.view, { code: trip.code })}
          <ChevronRight aria-hidden="true" />
        </Link>
      </Button>
    </article>
  );
}
