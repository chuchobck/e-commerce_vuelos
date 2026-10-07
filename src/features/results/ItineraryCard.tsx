import { Backpack, Briefcase, CalendarClock, Luggage, RotateCcw } from 'lucide-react';
import { cityOf, faresForCabin, type Fare, type Itinerary, type SearchCabin } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { fareName, formatDuration, formatMoney, formatTime } from '@/shared/lib/format';
import { Badge, Button } from '@/shared/ui';

const r = es.results;

interface ItineraryCardProps {
  itinerary: Itinerary;
  airlineName: string;
  /** Solo se muestran las familias de esta cabina. */
  cabin: SearchCabin;
  /** Familia marcada como elegida (ida ya seleccionada). */
  selectedBrand?: string;
  onChoose?: (itinerary: Itinerary, fare: Fare) => void;
}

/** Un itinerario con sus familias tarifarias y lo que incluye cada una, tal como lo entrega la API. */
export function ItineraryCard({ itinerary, airlineName, cabin, selectedBrand, onChoose }: ItineraryCardProps) {
  const { segments } = itinerary;
  const first = segments[0];
  const last = segments[segments.length - 1];
  const numbers = segments.map((s) => s.flightNumber).join(' + ');
  const headingId = `it-${itinerary.id.replace(/[^A-Za-z0-9]/g, '')}`;
  const fares = faresForCabin(itinerary, cabin);

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
          <Badge tone={itinerary.stops === 0 ? 'success' : 'info'}>
            {itinerary.stops === 0
              ? r.direct
              : `${fmt(r.stops, { count: itinerary.stops })} · ${fmt(r.via, { city: cityOf(first.destination) })}`}
          </Badge>
          <span className="text-muted">{fmt(r.duration, { duration: formatDuration(itinerary.durationMinutes) })}</span>
          <span className="text-muted">
            {fmt(r.flightLabel, { flight: numbers })} · {fmt(r.airline, { airline: airlineName })}
          </span>
        </div>
      </div>

      <ul aria-label={fmt(r.faresFor, { flight: numbers })} className="grid gap-4 p-6 md:grid-cols-3">
        {fares.map((fare) => {
          const family = fareName(fare.brand);
          const selected = selectedBrand === fare.brand;
          const { personalItem, carryOn, checked } = fare.baggage;
          return (
            <li
              key={`${fare.cabin}-${fare.brand}`}
              className={cn('flex flex-col gap-4 rounded border-2 p-4', selected ? 'border-primary bg-primary-tint' : 'border-border')}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-lg font-bold">{family}</p>
                <p className="text-right">
                  <span className="block text-xl font-bold tabular-nums">{formatMoney(fare.pricePerAdult)}</span>
                  <span className="text-sm text-muted">{es.common.perPerson}</span>
                </p>
              </div>
              <ul className="flex flex-col gap-2 text-sm">
                {personalItem ? (
                  <li className="flex items-center gap-2">
                    <Backpack aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    {r.personalItem}
                  </li>
                ) : null}
                <li className="flex items-center gap-2">
                  <Briefcase aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  {carryOn > 0 ? fmt(r.carryOn, { count: carryOn }) : r.carryOnNone}
                </li>
                <li className="flex items-center gap-2">
                  <Luggage aria-hidden="true" className="size-4 shrink-0 text-primary" />
                  {checked > 0 ? fmt(r.baggageChecked, { count: checked }) : r.baggageNone}
                </li>
                {fare.changeable ? (
                  <li className="flex items-center gap-2">
                    <CalendarClock aria-hidden="true" className="size-4 shrink-0 text-primary" />
                    {r.changeable}
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
                    price: formatMoney(fare.pricePerAdult),
                  })}
                  aria-pressed={selectedBrand ? selected : undefined}
                  onClick={() => onChoose(itinerary, fare)}
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
