import type { SeatMap } from '@/shared/api';

/** Un asiento del mapa, ya interpretado. */
export interface SeatCell {
  /** "12A". */
  number: string;
  row: number;
  letter: string;
  /** Posición en la cuadrícula del avión (índice dentro de `SeatLayout.letters`). */
  slot: number;
  /** Cabina del mapa en mayúsculas (p. ej. "ECONOMY"). */
  cabin: string;
  available: boolean;
  window: boolean;
  aisle: boolean;
  extraLegroom: boolean;
  exit: boolean;
}

export interface SeatRow {
  row: number;
  cabin: string;
  /** Asientos de la fila, de izquierda a derecha. */
  seats: SeatCell[];
  /** Los mismos asientos separados por el pasillo (el "juntos" no cruza el pasillo). */
  groups: SeatCell[][];
  extraSpace: boolean;
  exit: boolean;
  /** Fila junto al ala (referencia visual). */
  wing: boolean;
}

export interface SeatCabin {
  cabin: string;
  rows: SeatRow[];
}

export interface SeatLayout {
  /** Letras de todo el avión, de izquierda a derecha. */
  letters: string[];
  /** Letras después de las cuales hay pasillo. */
  aisleAfter: string[];
  cabins: SeatCabin[];
  /** Todas las filas en orden de lectura (de adelante hacia atrás). */
  rows: SeatRow[];
  bySeat: Map<string, SeatCell>;
}

const SEAT_NUMBER = /^(\d{1,3})([A-Z])$/;

/**
 * Convierte el mapa del contrato en una cuadrícula: filas, letras, pasillo, salidas y espacio extra.
 * Todo se deduce de `seatNumber` y `characteristics`; los campos son opcionales en el contrato, así
 * que lo que falte o venga mal formado se ignora. Un asiento solo está libre con `isAvailable === true`.
 */
export function buildSeatLayout(map: SeatMap): SeatLayout {
  const letterSet = new Set<string>();
  const aisleAfter = new Set<string>();
  const cabins: SeatCabin[] = [];

  for (const cabinDto of map.cabins ?? []) {
    const cabin = (cabinDto.cabinClass ?? '').toUpperCase();
    const rowsByNumber = new Map<number, SeatCell[]>();
    for (const rowDto of cabinDto.rows ?? []) {
      for (const dto of rowDto.seats ?? []) {
        const match = SEAT_NUMBER.exec(dto.seatNumber ?? '');
        if (!match) continue;
        const characteristics = dto.characteristics ?? [];
        const row = Number(match[1]);
        const cell: SeatCell = {
          number: `${row}${match[2]}`,
          row,
          letter: match[2],
          slot: -1,
          cabin,
          available: dto.isAvailable === true,
          window: characteristics.includes('WINDOW'),
          aisle: characteristics.includes('AISLE'),
          extraLegroom: characteristics.includes('EXTRA_LEGROOM'),
          exit: characteristics.includes('EMERGENCY_EXIT'),
        };
        letterSet.add(cell.letter);
        const cells = rowsByNumber.get(row) ?? [];
        cells.push(cell);
        rowsByNumber.set(row, cells);
      }
    }
    const rows = [...rowsByNumber.entries()]
      .sort(([a], [b]) => a - b)
      .map(([row, cells]): SeatRow => {
        const seats = [...cells].sort((a, b) => a.letter.localeCompare(b.letter));
        const groups: SeatCell[][] = [];
        seats.forEach((seat, i) => {
          const previous = seats[i - 1];
          if (previous?.aisle && seat.aisle) aisleAfter.add(previous.letter);
          if (!previous || (previous.aisle && seat.aisle)) groups.push([seat]);
          else groups[groups.length - 1].push(seat);
        });
        return {
          row,
          cabin,
          seats,
          groups,
          extraSpace: seats.some((s) => s.extraLegroom),
          exit: seats.some((s) => s.exit),
          wing: false,
        };
      });
    if (rows.length > 0) cabins.push({ cabin, rows });
  }

  cabins.sort((a, b) => a.rows[0].row - b.rows[0].row);
  const letters = [...letterSet].sort();
  const bySeat = new Map<string, SeatCell>();
  for (const cabin of cabins) {
    markWing(cabin.rows);
    for (const row of cabin.rows) {
      for (const seat of row.seats) {
        seat.slot = letters.indexOf(seat.letter);
        bySeat.set(seat.number, seat);
      }
    }
  }
  return { letters, aisleAfter: [...aisleAfter].sort(), cabins, rows: cabins.flatMap((c) => c.rows), bySeat };
}

/** El ala se dibuja desde una fila antes de las salidas hasta una después (solo referencia visual). */
function markWing(rows: SeatRow[]): void {
  const exits = rows.flatMap((r, i) => (r.exit ? [i] : []));
  if (exits.length === 0) return;
  const from = Math.max(0, exits[0] - 1);
  const to = Math.min(rows.length - 1, exits[exits.length - 1] + 1);
  for (let i = from; i <= to; i++) rows[i].wing = true;
}

/** Cabinas distintas que tiene el mapa. */
export function cabinsOf(layout: SeatLayout): string[] {
  return layout.cabins.map((c) => c.cabin);
}

/** Asientos de una cabina, en orden de lectura. */
export function seatsOfCabin(layout: SeatLayout, cabin: string): SeatCell[] {
  return layout.rows.filter((r) => r.cabin === cabin).flatMap((r) => r.seats);
}

/** Cantidad de asientos libres de una cabina. */
export function countAvailable(layout: SeatLayout, cabin: string): number {
  return seatsOfCabin(layout, cabin).filter((s) => s.available).length;
}
