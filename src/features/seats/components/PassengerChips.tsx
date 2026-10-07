import { Armchair, Baby } from 'lucide-react';
import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import type { SeatPassenger } from '../types';

const t = es.seats;

interface PassengerChipsProps {
  passengers: SeatPassenger[];
  activeId: string | undefined;
  /** Asiento de cada pasajero en el tramo que se está viendo. */
  seatOf: (passengerId: string) => string | undefined;
  onSelect: (passengerId: string) => void;
}

/**
 * Un chip por pasajero: se elige quién va a ocupar el asiento y luego el asiento. Muestra su asiento
 * o "Automático". Los bebés en brazos no ocupan asiento: se listan pero no se pueden elegir.
 */
export function PassengerChips({ passengers, activeId, seatOf, onSelect }: PassengerChipsProps) {
  return (
    <ul role="group" aria-label={t.passengersLabel} className="flex flex-wrap gap-2">
      {passengers.map((passenger, index) => {
        const typeLabel = t.passengerTypes[passenger.type] ?? passenger.type;
        const number = index + 1;
        if (passenger.type === 'INFANT') {
          return (
            <li key={passenger.id}>
              <div className="flex min-h-12 items-center gap-2 rounded border-2 border-dashed border-input bg-surface px-4 py-2 text-sm">
                <Baby aria-hidden="true" className="size-6 shrink-0 text-muted" />
                <span className="flex flex-col">
                  <span className="font-bold">
                    {number}. {passenger.name}
                  </span>
                  <span className="text-muted">
                    {typeLabel} · {t.infantLap}
                  </span>
                </span>
              </div>
            </li>
          );
        }
        const seat = seatOf(passenger.id);
        const active = passenger.id === activeId;
        return (
          <li key={passenger.id}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(passenger.id)}
              className={cn(
                'flex min-h-12 items-center gap-2 rounded border-2 px-4 py-2 text-left text-sm',
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-surface hover:bg-primary-tint',
              )}
            >
              <span aria-hidden="true" className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border-2 font-bold', active ? 'border-primary-foreground' : 'border-input')}>
                {number}
              </span>
              <span className="flex flex-col">
                <span className="font-bold">{passenger.name}</span>
                <span className={cn('flex items-center gap-2', active ? '' : 'text-muted')}>
                  {typeLabel} ·
                  <Armchair aria-hidden="true" className="size-4 shrink-0" />
                  <span>
                    <span className="sr-only">{fmt(t.passengerNumber, { number })}, </span>
                    {seat ? fmt(t.chipSeat, { seat }) : t.seatAuto}
                  </span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
