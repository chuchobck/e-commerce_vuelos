import { Armchair, Briefcase, Luggage, RotateCcw } from 'lucide-react';
import type { Airport, Fare, FlightOffer } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { formatDuration, formatTime, formatUSD } from '@/shared/lib/format';
import { Badge, Button } from '@/shared/ui';

const r = es.results;

export function cityOf(airports: Airport[] | undefined, code: string) {
  return airports?.find((a) => a.code === code)?.city ?? code;
}

function baggageText(fare: Fare) {
  const b = fare.baggage;
  const checked = b.checkedBags > 0 ? fmt(r.baggageChecked, { count: b.checkedBags, kg: b.checkedBagKg }) : r.baggageNone;
  return { carry: fmt(r.baggageCarry, { kg: b.carryOnKg }), checked };
}

interface OfferCardProps {
  offer: FlightOffer;
  airports?: Airport[];
  /** Tarifa marcada como elegida (ida ya seleccionada). */
  selectedFareId?: string;
  onChoose?: (offer: FlightOffer, fare: Fare) => void;
}

/** Tarjeta de un vuelo con sus 3 tarifas (Light, Classic, Flex) y el equipaje incluido. */
export function OfferCard({ offer, airports, selectedFareId, onChoose }: OfferCardProps) {
  const first = offer.segments[0];
  const last = offer.segments[offer.segments.length - 1];
  const numbers = offer.segments.map((s) => s.flightNumber).join(' + ');
  const headingId = `offer-${offer.id.replace(/[^A-Za-z0-9]/g, '')}`;

  return (
    <article aria-labelledby={headingId} className="rounded border-2 border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-border p-6">
        <h3 id={headingId} className="flex flex-wrap items-baseline gap-x-4 gap-y-2 text-xl">
          <span>
            <span className="sr-only">{r.departs} </span>
            <time dateTime={first.departureTime} className="text-2xl tabular-nums">
              {formatTime(first.departureTime)}
            </time>{' '}
            <span className="text-base font-normal text-muted">{first.origin}</span>
          </span>
          <span aria-hidden="true" className="text-muted">
            →
          </span>
          <span>
            <span className="sr-only">{r.arrives} </span>
            <time dateTime={last.arrivalTime} className="text-2xl tabular-nums">
              {formatTime(last.arrivalTime)}
            </time>{' '}
            <span className="text-base font-normal text-muted">{last.destination}</span>
          </span>
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={offer.stops === 0 ? 'success' : 'info'}>
            {offer.stops === 0
              ? r.direct
              : `${fmt(r.stops, { count: offer.stops })} · ${fmt(r.via, { city: cityOf(airports, first.destination) })}`}
          </Badge>
          <span className="text-muted">{fmt(r.duration, { duration: formatDuration(offer.durationMinutes) })}</span>
          <span className="text-muted">{fmt(r.flightLabel, { flight: numbers })}</span>
        </div>
      </div>

      <ul aria-label={fmt(r.faresFor, { flight: numbers })} className="grid gap-4 p-6 md:grid-cols-3">
        {offer.fares.map((fare) => {
          const bag = baggageText(fare);
          const family = es.fares[fare.family];
          const selected = selectedFareId === fare.id;
          return (
            <li
              key={fare.id}
              className={cn(
                'flex flex-col gap-4 rounded border-2 p-4',
                selected ? 'border-primary bg-primary-tint' : 'border-border',
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-lg font-bold">{family}</p>
                <p className="text-right">
                  <span className="block text-xl font-bold tabular-nums">{formatUSD(fare.pricePerAdult)}</span>
                  <span className="text-sm text-muted">{es.common.perPerson}</span>
                </p>
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                <li className="flex items-center gap-2">
                  <Briefcase aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  {bag.carry}
                </li>
                <li className="flex items-center gap-2">
                  <Luggage aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  {bag.checked}
                </li>
                {fare.seatSelectionIncluded ? (
                  <li className="flex items-center gap-2">
                    <Armchair aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    {r.seatIncluded}
                  </li>
                ) : null}
                {fare.refundable ? (
                  <li className="flex items-center gap-2">
                    <RotateCcw aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    {r.refundable}
                  </li>
                ) : null}
              </ul>
              <p className="text-sm text-muted">{fmt(r.seatsLeft, { count: fare.seatsLeft })}</p>
              {onChoose ? (
                <Button
                  variant={selected ? 'primary' : 'secondary'}
                  className="mt-auto"
                  aria-label={fmt(r.chooseFareLabel, {
                    fare: family,
                    flight: numbers,
                    time: formatTime(first.departureTime),
                    price: formatUSD(fare.pricePerAdult),
                  })}
                  aria-pressed={selectedFareId ? selected : undefined}
                  onClick={() => onChoose(offer, fare)}
                >
                  {r.chooseFare} {family}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
