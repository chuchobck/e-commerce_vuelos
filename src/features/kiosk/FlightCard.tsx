import { CheckCircle2, Clock, Lock, Plane, QrCode } from 'lucide-react';
import type { KioskBooking, KioskFlight } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatLongDate, formatTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui';
import { flightOffer } from './flightCheckIn';
import type { KioskBusy } from './useKioskFlow';

const t = es.kiosk.booking;

interface FlightCardProps {
  flight: KioskFlight;
  passengers: KioskBooking['passengers'];
  busy: KioskBusy;
  onCheckIn: () => void;
  onViewPasses: () => void;
}

/**
 * Un vuelo de la reserva con sus pasajeros (asiento y estado del check-in) y lo que se puede hacer: con la ventana abierta,
 * «Hacer check-in» (la API lo hace para toda la reserva); con la ventana sin abrir, cuándo abre; con la ventana cerrada, que
 * ya cerró; con todos registrados, «Ver pases». Cada estado lleva icono y texto, nunca solo color.
 */
export function FlightCard({ flight, passengers, busy, onCheckIn, onViewPasses }: FlightCardProps) {
  const offer = flightOffer(flight);
  const opens = flight.checkIn.opensAt;
  const heading = `flight-${flight.segmentId.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const state = (es.status.states as Record<string, string>)[flight.status];
  return (
    <article aria-labelledby={heading} className="flex flex-col gap-5 rounded border-2 border-primary bg-surface p-6 shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={heading} className="flex items-center gap-2 text-2xl">
            <Plane aria-hidden="true" className="size-6" />
            {fmt(t.flight, { flight: flight.flightNumber })}
          </h2>
          <p className="text-xl font-bold">{fmt(t.route, { origin: flight.origin, destination: flight.destination })}</p>
          <p className="text-lg text-muted">
            {fmt(t.departs, { date: formatLongDate(flight.departureAt), time: formatTime(flight.departureAt) })}
            {flight.departureTerminal ? ` · ${fmt(t.terminal, { terminal: flight.departureTerminal })}` : ''}
          </p>
        </div>
        {state ? (
          <p className="rounded border-2 border-border px-3 py-1 text-base font-bold">
            <span className="sr-only">{t.flightStatus}: </span>
            {state}
          </p>
        ) : null}
      </header>

      <ul aria-label={fmt(t.passengersLabel, { flight: flight.flightNumber })} className="flex flex-col gap-2">
        {flight.passengers.map((p) => {
          const person = passengers.find((x) => x.id === p.passengerId);
          const done = p.checkInStatus === 'CHECKED_IN';
          return (
            <li key={p.passengerId} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-lg">
              <span className="font-bold">{person ? `${person.firstName} ${person.lastName}` : ''}</span>
              <span className="flex flex-wrap items-center gap-4">
                <span>{p.seat ? fmt(t.seat, { seat: p.seat }) : t.noSeat}</span>
                <span className="flex items-center gap-1">
                  {done ? <CheckCircle2 aria-hidden="true" className="size-5 text-success" /> : <Clock aria-hidden="true" className="size-5 text-muted" />}
                  {t.checkInStatus[p.checkInStatus]}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {offer === 'registered' ? (
        <Button size="lg" className="min-h-16 text-xl sm:w-fit" onClick={onViewPasses} disabled={busy !== null} loading={busy === 'passes'} loadingText={t.loadingPasses}>
          <QrCode aria-hidden="true" />
          {t.viewPasses}
        </Button>
      ) : null}
      {offer === 'open' ? (
        <Button size="lg" className="min-h-16 text-xl sm:w-fit" onClick={onCheckIn} disabled={busy !== null && busy !== 'check-in'} loading={busy === 'check-in'} loadingText={t.checkingIn}>
          <CheckCircle2 aria-hidden="true" />
          {t.checkIn}
        </Button>
      ) : null}
      {offer === 'not-yet' ? (
        <p className="flex items-start gap-2 text-lg">
          <Clock aria-hidden="true" className="mt-1 size-5 shrink-0" />
          {opens ? fmt(t.windowNotYet, { date: formatLongDate(opens), time: formatTime(opens) }) : t.windowNotYetNoTime}
        </p>
      ) : null}
      {offer === 'closed' ? (
        <p className="flex items-start gap-2 text-lg">
          <Lock aria-hidden="true" className="mt-1 size-5 shrink-0" />
          {t.windowClosed}
        </p>
      ) : null}
    </article>
  );
}
