import type { SeatCell, SeatLayout } from './layout';

export interface SeatFilters {
  window: boolean;
  aisle: boolean;
  together: boolean;
  extraSpace: boolean;
}

export const NO_FILTERS: SeatFilters = { window: false, aisle: false, together: false, extraSpace: false };

export function hasFilters(filters: SeatFilters): boolean {
  return filters.window || filters.aisle || filters.together || filters.extraSpace;
}

/** "Más espacio" incluye las salidas de emergencia, que también tienen espacio de sobra. */
export function hasExtraSpace(seat: SeatCell): boolean {
  return seat.extraLegroom || seat.exit;
}

/**
 * Asientos libres de la cabina que forman parte de una tira de `count` o más asientos libres contiguos
 * (sin cruzar el pasillo). `usable` decide qué asientos cuentan como libres: el selector deja pasar
 * también los que ya eligió el propio grupo.
 */
export function togetherSeats(layout: SeatLayout, cabin: string, count: number, usable: (seat: SeatCell) => boolean): Set<string> {
  const result = new Set<string>();
  const need = Math.max(1, Math.min(count, largestGroup(layout, cabin)));
  for (const row of layout.rows) {
    if (row.cabin !== cabin) continue;
    for (const group of row.groups) {
      let run: SeatCell[] = [];
      const flush = () => {
        if (run.length >= need) run.forEach((s) => result.add(s.number));
        run = [];
      };
      for (const seat of group) {
        if (usable(seat)) run.push(seat);
        else flush();
      }
      flush();
    }
  }
  return result;
}

/** Asientos seguidos más grandes que tiene la cabina sin cruzar el pasillo. */
export function largestGroup(layout: SeatLayout, cabin: string): number {
  return Math.max(1, ...layout.rows.filter((r) => r.cabin === cabin).flatMap((r) => r.groups.map((g) => g.length)));
}

/** Cumple todos los filtros activos. `together` es el resultado de `togetherSeats` (solo se mira si el filtro está activo). */
export function matchesFilters(seat: SeatCell, filters: SeatFilters, together?: Set<string>): boolean {
  if (filters.window && !seat.window) return false;
  if (filters.aisle && !seat.aisle) return false;
  if (filters.extraSpace && !hasExtraSpace(seat)) return false;
  if (filters.together && !together?.has(seat.number)) return false;
  return true;
}
