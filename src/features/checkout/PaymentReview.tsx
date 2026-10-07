import { Link } from 'react-router-dom';
import { routes } from '@/app/routes';
import type { BookingPassenger } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatLongDate, formatTime } from '@/shared/lib/format';
import { Card, CardTitle } from '@/shared/ui';
import type { CheckoutSelection } from './selection';

const p = es.purchase;

/**
 * Revisión compacta de lo elegido antes de pagar, con enlaces para editar (los datos escritos se
 * conservan: el borrador vive en sessionStorage).
 */
export function PaymentReview({ selection, passengers }: { selection: CheckoutSelection; passengers: BookingPassenger[] }) {
  const legs = [selection.outbound, ...(selection.inbound ? [selection.inbound] : [])];
  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>{p.reviewTitle}</CardTitle>
      <dl className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <dt className="flex flex-wrap items-baseline justify-between gap-2 font-bold">
            {p.reviewFlight}
            <Link to={routes.results(selection.searchQuery)} className="inline-flex min-h-12 items-center font-normal">
              {p.changeFlight}
            </Link>
          </dt>
          {legs.map((leg, i) => {
            const first = leg.itinerary.segments[0];
            const last = leg.itinerary.segments[leg.itinerary.segments.length - 1];
            return (
              <dd key={i} className="text-muted">
                {fmt(es.results.route, { origin: first.origin, destination: last.destination })} · {formatLongDate(first.departureTime)} · {formatTime(first.departureTime)}
              </dd>
            );
          })}
        </div>
        <div className="flex flex-col gap-1">
          <dt className="flex flex-wrap items-baseline justify-between gap-2 font-bold">
            {p.reviewPassengers}
            <Link to={routes.checkoutDetails()} className="inline-flex min-h-12 items-center font-normal">
              {p.editPassengers}
            </Link>
          </dt>
          {passengers.map((pax) => (
            <dd key={pax.id} className="text-muted">
              {pax.firstName} {pax.lastName}
            </dd>
          ))}
        </div>
        {passengers[0] ? (
          <div className="flex flex-col gap-1">
            <dt className="font-bold">{p.reviewContact}</dt>
            <dd className="break-words text-muted">
              {passengers[0].email} · {passengers[0].phone}
            </dd>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}
