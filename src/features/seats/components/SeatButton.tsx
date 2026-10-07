import { Check, DoorOpen, Lock, MoveVertical, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { cn } from '@/shared/lib/cn';
import { seatAriaLabel, type SeatState } from '../model/describe';
import type { SeatCell } from '../model/layout';

interface SeatButtonProps {
  seat: SeatCell;
  state: SeatState;
  /** Quien lo eligió, si el asiento está elegido. `number` es el número de su chip (1, 2…). */
  holder?: { name: string; number: number; isActive: boolean };
  matches: boolean;
  tabbable: boolean;
  gridColumn: number;
  buttonRef: (element: HTMLButtonElement | null) => void;
  onActivate: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * Un asiento. El estado se ve con icono, patrón y texto (no solo con color):
 * libre = borde liso y letra; ocupado = rayado y X; elegido = relleno, visto y número del pasajero;
 * otra cabina = borde punteado y candado. Salida y espacio extra llevan su icono en la esquina.
 * Los asientos no disponibles usan aria-disabled (no disabled) para poder recorrerlos con el teclado.
 */
export function SeatButton({ seat, state, holder, matches, tabbable, gridColumn, buttonRef, onActivate, onKeyDown }: SeatButtonProps) {
  const unavailable = state === 'taken' || state === 'otherCabin';
  return (
    <div role="gridcell" className="flex items-center justify-center" style={{ gridColumn, gridRow: 1 }}>
      <button
        ref={buttonRef}
        type="button"
        tabIndex={tabbable ? 0 : -1}
        aria-label={seatAriaLabel(seat, state, holder?.name, matches)}
        aria-pressed={unavailable ? undefined : state === 'selected' && holder?.isActive === true}
        aria-disabled={unavailable || undefined}
        data-seat={seat.number}
        data-state={state}
        onClick={onActivate}
        onKeyDown={onKeyDown}
        className={cn(
          'relative flex h-[var(--seat)] w-[var(--seat)] flex-col items-center justify-between rounded-b-sm rounded-t-md border-2 pb-px text-sm font-bold leading-none',
          'transition-colors duration-150 motion-reduce:transition-none',
          state === 'free' && 'border-input bg-surface text-foreground hover:bg-primary-tint',
          state === 'selected' && 'border-primary bg-primary text-primary-foreground',
          state === 'selected' && holder?.isActive && 'ring-2 ring-foreground ring-offset-2 ring-offset-surface',
          state === 'taken' &&
            'cursor-not-allowed border-border bg-[repeating-linear-gradient(135deg,rgb(var(--color-border))_0_3px,rgb(var(--color-surface))_3px_7px)] text-muted',
          state === 'otherCabin' && 'cursor-not-allowed border-dashed border-border bg-background text-muted',
          !matches && state === 'free' && 'opacity-50',
        )}
      >
        <span aria-hidden="true" className="flex h-4 w-full items-center justify-between px-px">
          {state === 'selected' ? (
            <Check className="mx-auto size-4" strokeWidth={3} />
          ) : (
            <>
              {seat.extraLegroom ? <MoveVertical className="size-4" /> : <span />}
              {seat.exit ? <DoorOpen className="size-4" /> : <span />}
            </>
          )}
        </span>
        <span aria-hidden="true" className="flex h-4 items-center justify-center">
          {state === 'taken' ? <X className="size-4" strokeWidth={3} /> : null}
          {state === 'otherCabin' ? <Lock className="size-4" /> : null}
          {state === 'selected' ? holder?.number : null}
          {state === 'free' ? seat.letter : null}
        </span>
      </button>
    </div>
  );
}
