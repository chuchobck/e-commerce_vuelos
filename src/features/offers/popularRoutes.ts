import type { IataCode } from '@/shared/api';

export interface PopularRoute {
  origin: IataCode;
  destination: IataCode;
}

/**
 * Rutas que alimentan «Ofertas» en el inicio. Es la ÚNICA lista: para ofrecer otras, se edita aquí.
 * Todas deben tener vuelos según `shared/api/airports.ts` (lo vigila una prueba). El orden solo
 * decide quién se busca primero si el presupuesto se agota; lo que se muestra va de menor a mayor precio.
 */
export const POPULAR_ROUTES: readonly PopularRoute[] = [
  { origin: 'UIO', destination: 'GYE' },
  { origin: 'UIO', destination: 'CUE' },
  { origin: 'GYE', destination: 'GPS' },
  { origin: 'UIO', destination: 'GPS' },
  { origin: 'GYE', destination: 'CUE' },
  { origin: 'LOH', destination: 'CUE' },
];

/** Límites de una carga de ofertas. La API permite 20 búsquedas por minuto por IP: estos números la cuidan. */
export const OFFERS = {
  /** Tarjetas que se muestran como máximo. */
  limit: 6,
  /** Búsquedas reales (peticiones HTTP) que una carga puede enviar. Lo que está en caché no cuenta. */
  budget: 8,
  /** Búsquedas en vuelo a la vez. */
  concurrency: 2,
  /** Fechas que se prueban por ruta antes de decir «sin vuelos». */
  dateAttempts: 3,
  /** Primera fecha que se busca: hoy + estos días (una compra de última hora no es lo que se ofrece). */
  firstDayOffset: 3,
  /** Cuánto vale lo guardado (memoria y sessionStorage). */
  ttlMs: 10 * 60_000,
} as const;
