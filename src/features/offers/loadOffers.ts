import { addDays } from 'date-fns';
import { isAbortError, isApiError, type SearchOptions, type SearchParams, type SearchResult } from '@/shared/api';
import { lastFlightDate, today as todayDate, toIsoDate } from '@/shared/lib/dates';
import type { TtlCache } from '@/shared/lib/ttlCache';
import { cheapestOffer, offerId, sortOffers, type Offer } from './cheapestOffer';
import { OFFERS, POPULAR_ROUTES, type PopularRoute } from './popularRoutes';

export interface LoadOffersDeps {
  search: (params: SearchParams, options: SearchOptions) => Promise<SearchResult>;
  cache: TtlCache<Offer | null>;
  /** Hoy a las 00:00 (inyectable para las pruebas). */
  today?: () => Date;
  /** Última fecha con vuelos. */
  lastDate?: () => Date;
  /** Qué más cambia lo que responde la API (con el mock, el escenario de la URL): separa las entradas de la caché. */
  scope?: () => string;
}

export interface LoadOffersOptions {
  routes?: readonly PopularRoute[];
  budget?: number;
  concurrency?: number;
  dateAttempts?: number;
  firstDayOffset?: number;
  signal?: AbortSignal;
}

export interface LoadOffersReport {
  /** Ofertas encontradas, de menor a mayor precio. */
  offers: Offer[];
  /** Búsquedas que de verdad se enviaron (lo que ya estaba en caché no cuenta). */
  searches: number;
  /** Rutas sin vuelos en ninguna de las fechas probadas. */
  noFlights: PopularRoute[];
  /** Rutas cuya búsqueda falló (red, tiempo agotado, 5xx…). No se reintentan solas. */
  failed: PopularRoute[];
  /** Rutas que no se llegaron a buscar: se acabó el presupuesto, hubo un 429 o se canceló. */
  skipped: PopularRoute[];
  /** La API pidió esperar (429). Se detiene todo; `retryAfterSeconds` es el Retry-After si vino. */
  rateLimited: { retryAfterSeconds: number | null } | null;
  /** Se canceló (la persona salió de la página). No es una falla. */
  aborted: boolean;
}

interface Pending {
  route: PopularRoute;
  attempt: number;
}

/**
 * Busca, para cada ruta popular, la tarifa económica más baja de ida para un adulto en la primera fecha cercana
 * con vuelos (hoy + 3 días; si no hay, el día siguiente, hasta `dateAttempts` fechas).
 *
 * Presupuesto y cortesía con la API:
 *  - Como máximo `budget` búsquedas HTTP por carga, `concurrency` a la vez. Cada ruta recibe su primera búsqueda
 *    antes de que ninguna reciba la segunda (cola en rondas), así una ruta sin vuelos no se come el presupuesto de las demás.
 *  - Lo que está en caché (incluida «sin vuelos esa fecha») no cuesta ninguna búsqueda.
 *  - Cada búsqueda se envía una sola vez (`retry: false`): el cliente no la repite ante un 503 ni un corte de red. Es una
 *    búsqueda de fondo (`background`): nadie la espera en pantalla.
 *  - Un 429 detiene todo: no se vuelve a pedir nada hasta que la persona lo intente de nuevo. Otro error marca esa
 *    ruta como fallida y sigue con las demás; nunca hay un bucle de reintentos.
 *  - Con `signal` cancelada no se envía nada más y lo que esté en vuelo se aborta.
 */
export async function loadOffers(deps: LoadOffersDeps, options: LoadOffersOptions = {}): Promise<LoadOffersReport> {
  const {
    routes = POPULAR_ROUTES,
    budget = OFFERS.budget,
    concurrency = OFFERS.concurrency,
    dateAttempts = OFFERS.dateAttempts,
    firstDayOffset = OFFERS.firstDayOffset,
    signal,
  } = options;
  const start = addDays((deps.today ?? todayDate)(), firstDayOffset);
  const scope = deps.scope?.() ?? '';
  const last = toIsoDate((deps.lastDate ?? lastFlightDate)());

  const queue: Pending[] = routes.map((route) => ({ route, attempt: 0 }));
  const found: Offer[] = [];
  const noFlights: PopularRoute[] = [];
  const failed: PopularRoute[] = [];
  const skipped: PopularRoute[] = [];
  let searches = 0;
  let rateLimited: LoadOffersReport['rateLimited'] = null;
  let aborted = false;
  let stopped = false;

  /** La fecha de este intento no ofreció vuelos: se pasa al día siguiente o se da la ruta por sin vuelos. */
  const nextDateOrGiveUp = ({ route, attempt }: Pending) => {
    if (attempt + 1 < dateAttempts) queue.push({ route, attempt: attempt + 1 });
    else noFlights.push(route);
  };

  async function attemptOne(item: Pending): Promise<void> {
    const { route, attempt } = item;
    const date = toIsoDate(addDays(start, attempt));
    if (date > last) {
      noFlights.push(route);
      return;
    }
    const key = scope + offerId(route, date);
    const cached = deps.cache.get(key);
    if (cached !== undefined) {
      if (cached) found.push(cached);
      else nextDateOrGiveUp(item);
      return;
    }
    if (searches >= budget) {
      skipped.push(route); // sin presupuesto: esta ruta no se busca (las que estén en caché aún se atienden)
      return;
    }
    searches += 1;
    try {
      const result = await deps.search(
        { origin: route.origin, destination: route.destination, departDate: date, passengers: { adults: 1, children: 0, infants: 0 }, cabin: 'ECONOMY' },
        { signal, retry: false, background: true },
      );
      const offer = cheapestOffer(route, date, result.offers);
      deps.cache.set(key, offer);
      if (offer) found.push(offer);
      else nextDateOrGiveUp(item);
    } catch (error) {
      if (isAbortError(error) || signal?.aborted) {
        aborted = true;
        stopped = true;
        skipped.push(route);
      } else if (isApiError(error) && error.status === 429) {
        rateLimited = { retryAfterSeconds: error.retryAfter ?? null };
        stopped = true;
        skipped.push(route);
      } else {
        failed.push(route);
      }
    }
  }

  async function worker(): Promise<void> {
    while (!stopped && !signal?.aborted) {
      const item = queue.shift();
      if (!item) return;
      await attemptOne(item);
    }
    if (signal?.aborted) aborted = true;
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  return {
    offers: sortOffers(found),
    searches,
    noFlights,
    failed,
    // Las que no se buscaron por falta de presupuesto, un 429 o una cancelación, más las que quedaron en la cola.
    skipped: [...skipped, ...queue.map((item) => item.route)].filter((r, i, all) => all.findIndex((o) => o.origin === r.origin && o.destination === r.destination) === i),
    rateLimited,
    aborted,
  };
}
