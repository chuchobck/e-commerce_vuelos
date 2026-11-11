import { Baby, User } from 'lucide-react';
import { useId } from 'react';
import { es, fmt } from '@/shared/i18n';
import type { BookingCheckIn } from '@/shared/lib/checkinStatus';
import { formatLongDate, formatTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui';
import { CheckInStatusBadge } from './CheckInStatusBadge';

const c = es.aftersale.checkin;

interface CheckInFlightsProps {
  checkIn: BookingCheckIn;
  title: string;
  /** Muestra, en cada vuelo, el asiento de cada pasajero EN ESE VUELO (pantalla de check-in). */
  showPassengers?: boolean;
}

/**
 * Estado del check-in vuelo por vuelo, con el conteo «Check-in hecho en N de M vuelos». El conteo es role="status": cuando
 * cambia (después de confirmar) el lector de pantalla lo anuncia, sin repetir toda la lista. Si no se pudo saber qué vuelos
 * tienen pase, no hay conteo y se dice por qué.
 */
export function CheckInFlights({ checkIn, title, showPassengers = false }: CheckInFlightsProps) {
  const titleId = useId();
  const { done, total } = checkIn;
  const tone = done === 0 ? 'neutral' : done === total ? 'success' : 'info';

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <h2 id={titleId} className="text-xl">
        {title}
      </h2>
      {checkIn.known ? (
        <p role="status">
          <Badge tone={tone}>{fmt(total === 1 ? c.summaryOne : c.summary, { done, total })}</Badge>
        </p>
      ) : (
        <p className="text-sm text-muted">{c.unknown}</p>
      )}
      <ul aria-label={c.flightsLabel} className="flex flex-col divide-y-2 divide-border rounded border-2 border-border">
        {checkIn.flights.map((flight) => (
          <li key={flight.segment.id} className="flex flex-col gap-2 px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="font-bold">
                  {fmt(c.flightLine, { leg: es.aftersale.legs[flight.leg], flight: flight.segment.flightNumber, route: `${flight.segment.origin} → ${flight.segment.destination}` })}
                </span>
                <span className="text-sm tabular-nums text-muted">{fmt(c.flightWhen, { date: formatLongDate(flight.segment.departureTime), time: formatTime(flight.segment.departureTime) })}</span>
              </div>
              <CheckInStatusBadge flight={flight} />
            </div>
            {showPassengers ? (
              <ul className="flex flex-col gap-2">
                {flight.seats.map((p) => {
                  const Icon = p.infant ? Baby : User;
                  return (
                    <li key={p.passengerId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Icon aria-hidden="true" className="size-5 text-primary" />
                        {p.name}
                      </span>
                      <span className="text-muted">{p.infant ? c.infantLap : p.seat ? fmt(c.seatLine, { seat: p.seat }) : c.seatAuto}</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
