import { PlaneTakeoff } from 'lucide-react';
import type { SelectedLeg } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { fareName, formatDuration, formatLongDate, formatTime } from '@/shared/lib/format';

function LegRow({ title, leg }: { title: string; leg: SelectedLeg }) {
  const { segments } = leg.itinerary;
  const first = segments[0];
  const last = segments[segments.length - 1];
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
          {fmt(es.results.flightLabel, { flight: segments.map((s) => s.flightNumber).join(' + ') })} ·{' '}
          {fmt(es.results.duration, { duration: formatDuration(leg.itinerary.durationMinutes) })} ·{' '}
          {fmt(es.purchase.fareLabel, { fare: fareName(leg.fare.brand) })}
        </span>
      </dd>
    </div>
  );
}

/** Resumen de ida y vuelta como lista de definiciones. */
export function TripSummary({ outbound, inbound }: { outbound: SelectedLeg; inbound?: SelectedLeg }) {
  return (
    <dl className="flex flex-col gap-6">
      <LegRow title={es.purchase.outbound} leg={outbound} />
      {inbound ? <LegRow title={es.purchase.inbound} leg={inbound} /> : null}
    </dl>
  );
}
