import { PlaneTakeoff } from 'lucide-react';
import type { Fare, FlightOffer } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatDuration, formatLongDate, formatTime } from '@/shared/lib/format';

interface Leg {
  offer: FlightOffer;
  fare: Fare;
}

function LegRow({ title, leg }: { title: string; leg: Leg }) {
  const first = leg.offer.segments[0];
  const last = leg.offer.segments[leg.offer.segments.length - 1];
  return (
    <div className="flex flex-col gap-2">
      <dt className="flex items-center gap-2 font-bold">
        <PlaneTakeoff aria-hidden="true" className="size-6 text-primary" />
        {title} · {formatLongDate(first.departureTime)}
      </dt>
      <dd className="flex flex-col gap-2 pl-8">
        <span className="text-lg">
          <time dateTime={first.departureTime} className="font-bold tabular-nums">
            {formatTime(first.departureTime)}
          </time>{' '}
          {first.origin} → {' '}
          <time dateTime={last.arrivalTime} className="font-bold tabular-nums">
            {formatTime(last.arrivalTime)}
          </time>{' '}
          {last.destination}
        </span>
        <span className="text-sm text-muted">
          {fmt(es.results.flightLabel, { flight: leg.offer.segments.map((s) => s.flightNumber).join(' + ') })} ·{' '}
          {fmt(es.results.duration, { duration: formatDuration(leg.offer.durationMinutes) })} ·{' '}
          {fmt(es.purchase.fareLabel, { fare: es.fares[leg.fare.family] })}
        </span>
      </dd>
    </div>
  );
}

/** Resumen de ida y vuelta como lista de definiciones. */
export function TripSummary({ outbound, inbound }: { outbound: Leg; inbound?: Leg }) {
  return (
    <dl className="flex flex-col gap-6">
      <LegRow title={es.purchase.outbound} leg={outbound} />
      {inbound ? <LegRow title={es.purchase.inbound} leg={inbound} /> : null}
    </dl>
  );
}

