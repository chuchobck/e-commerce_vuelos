import { hasExtraSpace, type SeatFilters } from './filters';
import type { SeatCell, SeatLayout } from './layout';

export interface RecommendOptions {
  cabin: string;
  /** Cuántos asientos hay que recomendar. */
  count: number;
  filters: SeatFilters;
  /** Asientos que no se pueden usar (ya elegidos por otros pasajeros del grupo). */
  blocked?: ReadonlySet<string>;
  /** No recomendar salidas de emergencia (p. ej. si viaja un niño). */
  avoidExit?: boolean;
}

function isFree(seat: SeatCell, { cabin, blocked, avoidExit }: RecommendOptions): boolean {
  return seat.available && seat.cabin === cabin && !blocked?.has(seat.number) && !(avoidExit && seat.exit);
}

/** Cuanto más alto, mejor. Los filtros activos pesan más que ir adelante. */
function score(window: SeatCell[], filters: SeatFilters): number {
  let points = 0;
  if (filters.window && window.some((s) => s.window)) points += 100;
  if (filters.aisle && window.some((s) => s.aisle)) points += 100;
  if (filters.extraSpace && window.every(hasExtraSpace)) points += 100;
  // Sin filtros: libres de salida y de espacio extra primero no aporta nada; solo se prefiere ir adelante.
  return points - window[0].row;
}

/** Ventanas de `size` asientos libres contiguos (sin cruzar el pasillo). */
function windowsOf(layout: SeatLayout, size: number, options: RecommendOptions): SeatCell[][] {
  const out: SeatCell[][] = [];
  for (const row of layout.rows) {
    if (row.cabin !== options.cabin) continue;
    for (const group of row.groups) {
      for (let start = 0; start + size <= group.length; start++) {
        const candidate = group.slice(start, start + size);
        if (candidate.every((s) => isFree(s, options))) out.push(candidate);
      }
    }
  }
  return out;
}

/**
 * Asientos para un grupo: lo más juntos posible. Se prueba con una tira de `count` asientos, luego
 * de `count - 1`, etc., y el resto se completa con los libres más cercanos. Los filtros de ventana,
 * pasillo y espacio son preferencias: si no hay asientos que los cumplan se recomienda igual lo mejor
 * que quede libre.
 */
export function recommendSeats(layout: SeatLayout, options: RecommendOptions): string[] {
  const { count, filters } = options;
  if (count <= 0) return [];
  const chosen: SeatCell[] = [];
  for (let size = count; size >= 1 && chosen.length === 0; size--) {
    const windows = windowsOf(layout, size, options);
    if (windows.length === 0) continue;
    // Entre dos puntajes iguales gana la primera ventana (delante y a la izquierda).
    const best = windows.reduce((a, b) => (score(b, filters) > score(a, filters) ? b : a));
    chosen.push(...best);
  }
  const taken = new Set(chosen.map((s) => s.number));
  while (chosen.length < count) {
    const near = nearestAvailable(layout, chosen[0]?.number ?? firstFree(layout, options)?.number, {
      ...options,
      blocked: new Set([...(options.blocked ?? []), ...taken]),
    });
    if (!near) break;
    chosen.push(layout.bySeat.get(near)!);
    taken.add(near);
  }
  return chosen
    .sort((a, b) => a.row - b.row || a.slot - b.slot)
    .map((s) => s.number);
}

function firstFree(layout: SeatLayout, options: RecommendOptions): SeatCell | undefined {
  return layout.rows.flatMap((r) => r.seats).find((s) => isFree(s, options));
}

/**
 * Asiento libre más cercano a `from` en la cabina correcta: pesan más las filas que las columnas y
 * se prefiere el mismo tipo de lugar (ventana con ventana, pasillo con pasillo). `from` no cuenta.
 */
export function nearestAvailable(
  layout: SeatLayout,
  from: string | undefined,
  options: Pick<RecommendOptions, 'cabin' | 'blocked' | 'avoidExit'>,
): string | null {
  const origin = from ? layout.bySeat.get(from) : undefined;
  const opts = { ...options, count: 1, filters: { window: false, aisle: false, together: false, extraSpace: false } };
  let best: { seat: SeatCell; distance: number } | null = null;
  for (const row of layout.rows) {
    for (const seat of row.seats) {
      if (seat.number === from || !isFree(seat, opts)) continue;
      const distance = origin
        ? Math.abs(seat.row - origin.row) * 3 +
          Math.abs(seat.slot - origin.slot) +
          (seat.window !== origin.window || seat.aisle !== origin.aisle ? 2 : 0)
        : seat.row;
      if (!best || distance < best.distance) best = { seat, distance };
    }
  }
  return best?.seat.number ?? null;
}
