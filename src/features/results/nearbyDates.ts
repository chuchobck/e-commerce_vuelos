import { addDays } from 'date-fns';
import type { Money, SearchCabin, SearchParams, SearchResult } from '@/shared/api';
import { lastFlightDate, parseIsoDate, toIsoDate, today } from '@/shared/lib/dates';
import { cheapestOf, usableGroups } from './grouping';

/**
 * Qué se mueve al buscar fechas cercanas:
 *  - `both`: salida (y regreso, con la misma duración del viaje) cuando no hay vuelos ese día;
 *  - `return`: solo el regreso, cuando la ida existe pero no hay vuelta.
 */
export type NearbyKind = 'both' | 'return';

export interface DateVariant {
  id: string;
  kind: NearbyKind;
  /** Búsqueda con las fechas movidas. */
  params: SearchParams;
  /** Días de diferencia con la fecha pedida (negativo = antes). */
  offsetDays: number;
}

export interface NearbyResult {
  variant: DateVariant;
  /** Precio por adulto más bajo ese día. */
  from: Money;
}

const MAX_SPAN = 3;

/** Días a probar ordenados por cercanía: -1, +1, -2, +2, -3, +3. */
const OFFSETS = Array.from({ length: MAX_SPAN }, (_, i) => [-(i + 1), i + 1]).flat();


/**
 * Búsquedas candidatas alrededor de la fecha pedida, de la más cercana a la más lejana. Se descartan las
 * fechas que ya pasaron o que están fuera de la ventana de venta (la API responde sin ofertas ahí).
 */
export function nearbyVariants(params: SearchParams, kind: NearbyKind, now: Date = today(), last: Date = lastFlightDate()): DateVariant[] {
  const depart = parseIsoDate(params.departDate);
  const back = params.returnDate ? parseIsoDate(params.returnDate) : null;
  if (!depart) return [];
  const variants: DateVariant[] = [];
  for (const offsetDays of OFFSETS) {
    if (kind === 'return') {
      if (!back) continue;
      const newBack = addDays(back, offsetDays);
      if (newBack < depart || newBack < now || newBack > last) continue;
      variants.push({ id: `r${offsetDays}`, kind, offsetDays, params: { ...params, returnDate: toIsoDate(newBack) } });
    } else {
      const newDepart = addDays(depart, offsetDays);
      const newBack = back ? addDays(back, offsetDays) : null;
      if (newDepart < now || newDepart > last || (newBack && newBack > last)) continue;
      variants.push({
        id: `b${offsetDays}`,
        kind,
        offsetDays,
        params: { ...params, departDate: toIsoDate(newDepart), returnDate: newBack ? toIsoDate(newBack) : undefined },
      });
    }
  }
  return variants;
}

interface FindOptions {
  search: (params: SearchParams) => Promise<SearchResult>;
  /** Cuántas fechas con vuelos se quieren (se deja de buscar al llegar). */
  limit?: number;
  /** Búsquedas a la vez. La API limita a 20 por minuto por IP, así que son pocas. */
  concurrency?: number;
  isCancelled?: () => boolean;
}

/**
 * Busca, de la más cercana a la más lejana, fechas que sí tengan vuelos utilizables en la cabina pedida.
 * Hace como máximo 6 búsquedas. Una búsqueda que falla se salta (no rompe la sugerencia). Devuelve ordenado
 * por cercanía a la fecha pedida.
 */
export async function findNearby(params: SearchParams, kind: NearbyKind, { search, limit = 4, concurrency = 2, isCancelled }: FindOptions): Promise<NearbyResult[]> {
  const variants = nearbyVariants(params, kind);
  const roundTrip = !!params.returnDate;
  const cabin: SearchCabin = params.cabin;
  const found: NearbyResult[] = [];
  let next = 0;

  const worker = async () => {
    while (next < variants.length && found.length < limit && !isCancelled?.()) {
      const variant = variants[next++];
      try {
        const result = await search(variant.params);
        const groups = usableGroups(result.offers, cabin, roundTrip);
        const from = cheapestOf(groups, cabin);
        if (groups.length > 0 && from) found.push({ variant, from });
      } catch {
        /* una fecha que no se pudo consultar simplemente no se sugiere */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, variants.length) }, worker));
  return found.sort((a, b) => Math.abs(a.variant.offsetDays) - Math.abs(b.variant.offsetDays) || a.variant.offsetDays - b.variant.offsetDays);
}
