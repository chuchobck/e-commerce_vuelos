import { CalendarCheck } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router-dom';
import { routes } from '@/app/routes';
import { es, fmt } from '@/shared/i18n';
import type { BookingCheckIn, FlightCheckIn } from '@/shared/lib/checkinStatus';
import { formatLongDate, formatTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui';

const t = es.aftersale.passes;

function reasonFor(flight: FlightCheckIn): string {
  if (flight.status === 'no-abre-aun') return fmt(t.missing['no-abre-aun'], { date: formatLongDate(flight.opensAtLocal), time: formatTime(flight.opensAtLocal) });
  if (flight.status === 'hecho') return '';
  return t.missing[flight.status];
}

/**
 * Los vuelos de la reserva que no tienen pase de abordar, cada uno con una línea que dice por qué (salió, el check-in cerró,
 * aún no abre o falta hacerlo). Si alguno está abierto, lleva al check-in. Un vuelo que salió CON pase no aparece: su pase
 * está en la lista. No se imprime: la hoja impresa es solo de pases.
 */
export function MissingPasses({ checkIn, bookingId }: { checkIn: BookingCheckIn; bookingId: string }) {
  const titleId = useId();
  const missing = checkIn.flights.filter((f) => !f.checkedIn);
  if (missing.length === 0) return null;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4 print:hidden">
      <h2 id={titleId} className="text-xl">
        {t.missingTitle}
      </h2>
      <ul className="flex flex-col divide-y-2 divide-border rounded border-2 border-border">
        {missing.map((flight) => (
          <li key={flight.segment.id} className="flex flex-col gap-1 px-4 py-4">
            <span className="font-bold">
              {fmt(t.missingFlight, { leg: es.aftersale.legs[flight.leg], flight: flight.segment.flightNumber, route: `${flight.segment.origin} → ${flight.segment.destination}` })}
            </span>
            <span className="text-muted">{reasonFor(flight)}</span>
          </li>
        ))}
      </ul>
      {checkIn.available ? (
        <div>
          <Button asChild>
            <Link to={routes.tripCheckIn(bookingId)}>
              <CalendarCheck aria-hidden="true" />
              {t.goCheckIn}
            </Link>
          </Button>
        </div>
      ) : null}
    </section>
  );
}
