import { es, fmt } from '@/shared/i18n';
import type { SeatCell } from './layout';

const t = es.seats;

export type SeatState = 'free' | 'taken' | 'selected' | 'otherCabin';

export function positionText(seat: SeatCell): string {
  if (seat.window && seat.aisle) return t.position.windowAisle;
  if (seat.window) return t.position.window;
  if (seat.aisle) return t.position.aisle;
  return t.position.middle;
}

/** Características visibles del asiento, en texto ("espacio extra", "salida de emergencia"). */
export function extrasOf(seat: SeatCell): string[] {
  return [...(seat.extraLegroom ? [t.extra] : []), ...(seat.exit ? [t.exit] : [])];
}

export function stateText(state: SeatState, holderName?: string): string {
  switch (state) {
    case 'taken':
      return t.stateTaken;
    case 'otherCabin':
      return t.stateOtherCabin;
    case 'selected':
      return holderName ? fmt(t.stateSelected, { name: holderName }) : t.stateSelectedYou;
    default:
      return t.stateFree;
  }
}

/** Nombre accesible del asiento: "Asiento 12A, ventana, espacio extra, disponible". */
export function seatAriaLabel(seat: SeatCell, state: SeatState, holderName?: string, matches = true): string {
  return [
    fmt(t.seatLabel, { seat: seat.number }),
    positionText(seat),
    ...extrasOf(seat),
    stateText(state, holderName),
    ...(matches ? [] : [t.notMatching]),
  ].join(', ');
}
