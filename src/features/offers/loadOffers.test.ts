import { describe, expect, it, vi } from 'vitest';
import { ApiError, type SearchOptions, type SearchParams, type SearchResult } from '@/shared/api';
import { createTtlCache } from '@/shared/lib/ttlCache';
import type { Offer } from './cheapestOffer';
import { loadOffers, type LoadOffersDeps } from './loadOffers';
import { OFFERS, POPULAR_ROUTES, type PopularRoute } from './popularRoutes';
import { fare, flightOffer, searchResult } from './testSupport';

const TODAY = new Date(2026, 9, 10); // sábado 10 de octubre de 2026
const FIRST = '2026-10-13'; // hoy + 3
const LAST_DATE = new Date(2027, 0, 7);

type Handler = (params: SearchParams, options: SearchOptions) => Promise<SearchResult> | SearchResult;

const later = (ms = 2) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Precio base por ruta, para que cada una tenga su propia oferta más barata. */
const PRICE: Record<string, number> = { 'UIO-GYE': 5500, 'UIO-CUE': 6000, 'GYE-GPS': 19000, 'UIO-GPS': 21000, 'GYE-CUE': 4000, 'LOH-CUE': 9000 };

const withFlights = (params: SearchParams): SearchResult => {
  const route = { origin: params.origin, destination: params.destination };
  const base = PRICE[`${route.origin}-${route.destination}`] ?? 5000;
  return searchResult(params, [
    flightOffer(route, params.departDate, { flight: 'LA1', departs: '06:00', fares: [fare(base + 1500)] }),
    flightOffer(route, params.departDate, { flight: 'AV2', departs: '12:00', fares: [fare(base)] }),
  ]);
};

function setup(handler: Handler = withFlights, over: Partial<LoadOffersDeps> = {}) {
  let now = 1_000_000;
  const clock = { advance: (ms: number) => (now += ms) };
  const cache = createTtlCache<Offer | null>('test.offers', OFFERS.ttlMs, () => now);
  const stats = { active: 0, maxActive: 0, calls: [] as SearchParams[], options: [] as SearchOptions[] };
  const search = vi.fn(async (params: SearchParams, options: SearchOptions) => {
    stats.calls.push(params);
    stats.options.push(options);
    stats.active += 1;
    stats.maxActive = Math.max(stats.maxActive, stats.active);
    try {
      await later();
      return await handler(params, options);
    } finally {
      stats.active -= 1;
    }
  });
  const deps: LoadOffersDeps = { search, cache, today: () => TODAY, lastDate: () => LAST_DATE, ...over };
  return { deps, search, cache, stats, clock };
}

const noFlights: Handler = (params) => searchResult(params, []);
const key = (r: PopularRoute) => `${r.origin}-${r.destination}`;

describe('carga de ofertas', () => {
  it('busca cada ruta popular: ida, 1 adulto, economía, hoy + 3 días, sin reintento propio del cliente', async () => {
    const { deps, stats } = setup();
    const report = await loadOffers(deps);
    expect(report.searches).toBe(POPULAR_ROUTES.length);
    expect(stats.calls.map((c) => `${c.origin}-${c.destination}`).sort()).toEqual(POPULAR_ROUTES.map(key).sort());
    for (const call of stats.calls) {
      expect(call).toMatchObject({ departDate: FIRST, passengers: { adults: 1, children: 0, infants: 0 }, cabin: 'ECONOMY' });
      expect(call.returnDate).toBeUndefined();
    }
    expect(stats.options.every((o) => o.retry === false)).toBe(true);
  });

  it('devuelve la tarifa más baja de cada ruta, de menor a mayor precio', async () => {
    const { deps } = setup();
    const { offers } = await loadOffers(deps);
    expect(offers.map((o) => [key(o), o.price.cents])).toEqual([
      ['GYE-CUE', 4000],
      ['UIO-GYE', 5500],
      ['UIO-CUE', 6000],
      ['LOH-CUE', 9000],
      ['GYE-GPS', 19000],
      ['UIO-GPS', 21000],
    ]);
    expect(offers.every((o) => o.date === FIRST)).toBe(true);
  });

  it('nunca hay más de 2 búsquedas en vuelo a la vez', async () => {
    const { deps, stats } = setup();
    await loadOffers(deps);
    expect(stats.maxActive).toBe(2);
  });

  it('respeta una concurrencia distinta si se la piden', async () => {
    const { deps, stats } = setup();
    await loadOffers(deps, { concurrency: 1 });
    expect(stats.maxActive).toBe(1);
  });

  it('una ruta sin vuelos prueba el día siguiente (máximo 3 fechas) y sigue con las demás', async () => {
    const { deps, stats } = setup((params) => (params.origin === 'UIO' && params.destination === 'CUE' ? searchResult(params, []) : withFlights(params)));
    const report = await loadOffers(deps);
    const cuenca = stats.calls.filter((c) => c.origin === 'UIO' && c.destination === 'CUE').map((c) => c.departDate);
    expect(cuenca).toEqual(['2026-10-13', '2026-10-14', '2026-10-15']);
    expect(report.noFlights).toEqual([{ origin: 'UIO', destination: 'CUE' }]);
    expect(report.offers).toHaveLength(POPULAR_ROUTES.length - 1);
    expect(report.searches).toBe(POPULAR_ROUTES.length - 1 + 3);
  });

  it('si la primera fecha no tiene vuelos pero la segunda sí, ofrece la segunda', async () => {
    const { deps } = setup((params) => (params.departDate === FIRST ? searchResult(params, []) : withFlights(params)));
    const report = await loadOffers(deps, { budget: 12 });
    expect(report.offers).toHaveLength(POPULAR_ROUTES.length);
    expect(report.offers.every((o) => o.date === '2026-10-14')).toBe(true);
    expect(report.noFlights).toEqual([]);
  });

  it('con el presupuesto normal (8), si todas fallan la primera fecha solo 2 rutas llegan a la segunda; el resto se avisa como no buscado', async () => {
    const { deps } = setup((params) => (params.departDate === FIRST ? searchResult(params, []) : withFlights(params)));
    const report = await loadOffers(deps);
    expect(report.searches).toBe(OFFERS.budget);
    expect(report.offers).toHaveLength(2);
    expect(report.skipped).toHaveLength(POPULAR_ROUTES.length - 2);
  });

  it('presupuesto: nunca más de 8 búsquedas, y cada ruta tiene su primera antes que ninguna la segunda', async () => {
    const { deps, stats } = setup(noFlights);
    const report = await loadOffers(deps);
    expect(report.searches).toBe(OFFERS.budget);
    expect(stats.calls).toHaveLength(8);
    // 6 rutas × 1.ª fecha, y recién después 2 de las segundas.
    expect(stats.calls.slice(0, 6).every((c) => c.departDate === FIRST)).toBe(true);
    expect(new Set(stats.calls.slice(0, 6).map((c) => `${c.origin}-${c.destination}`)).size).toBe(6);
    // Las que se quedaron sin presupuesto se dicen: no se pierden en silencio.
    expect(report.skipped.length).toBeGreaterThan(0);
    expect(report.noFlights.length + report.skipped.length).toBe(POPULAR_ROUTES.length);
  });

  it('presupuesto: con otro tope en las opciones, se respeta ese', async () => {
    const { deps } = setup();
    const report = await loadOffers(deps, { budget: 3 });
    expect(report.searches).toBe(3);
    expect(report.offers).toHaveLength(3);
    expect(report.skipped).toHaveLength(POPULAR_ROUTES.length - 3);
  });

  it('un segundo intento con todo en caché no envía ninguna búsqueda', async () => {
    const { deps, search } = setup();
    const first = await loadOffers(deps);
    expect(search).toHaveBeenCalledTimes(POPULAR_ROUTES.length);
    const second = await loadOffers(deps);
    expect(search).toHaveBeenCalledTimes(POPULAR_ROUTES.length);
    expect(second.searches).toBe(0);
    expect(second.offers).toEqual(first.offers);
  });

  it('«esta fecha no tiene vuelos» también se guarda: no se vuelve a preguntar', async () => {
    const { deps, search } = setup(noFlights);
    await loadOffers(deps, { budget: 100 });
    const sent = search.mock.calls.length;
    expect(sent).toBe(POPULAR_ROUTES.length * OFFERS.dateAttempts);
    const again = await loadOffers(deps, { budget: 100 });
    expect(search).toHaveBeenCalledTimes(sent);
    expect(again.noFlights).toHaveLength(POPULAR_ROUTES.length);
  });

  it('la caché vence a los 10 minutos: pasado el TTL se busca de nuevo', async () => {
    const { deps, search, clock } = setup();
    await loadOffers(deps);
    clock.advance(OFFERS.ttlMs - 1);
    await loadOffers(deps);
    expect(search).toHaveBeenCalledTimes(POPULAR_ROUTES.length);
    clock.advance(2);
    await loadOffers(deps);
    expect(search).toHaveBeenCalledTimes(POPULAR_ROUTES.length * 2);
  });

  it('429: se detiene, no manda más búsquedas, avisa el Retry-After y conserva lo que ya llegó', async () => {
    let n = 0;
    const { deps, search } = setup((params) => {
      n += 1;
      if (n >= 3) throw new ApiError({ status: 429, code: 'RATE_LIMIT_EXCEEDED', retryAfter: 17 });
      return withFlights(params);
    });
    const report = await loadOffers(deps);
    expect(report.rateLimited).toEqual({ retryAfterSeconds: 17 });
    // 2 buenas + las que estaban en vuelo cuando llegó el 429 (concurrencia 2); ninguna después.
    expect(search.mock.calls.length).toBeLessThanOrEqual(4);
    expect(report.offers).toHaveLength(2);
    expect(report.failed).toEqual([]);
    expect(report.skipped.length).toBeGreaterThan(0);
    const before = search.mock.calls.length;
    await later(20);
    expect(search).toHaveBeenCalledTimes(before);
  });

  it('429 sin Retry-After: lo dice como desconocido (null), nunca inventa una espera', async () => {
    const { deps } = setup(() => {
      throw new ApiError({ status: 429, code: 'RATE_LIMIT_EXCEEDED' });
    });
    const report = await loadOffers(deps);
    expect(report.rateLimited).toEqual({ retryAfterSeconds: null });
    expect(report.offers).toEqual([]);
  });

  it('un 503 deja esa ruta como fallida, sigue con las demás y no la reintenta', async () => {
    const { deps, stats } = setup((params) => {
      if (params.origin === 'GYE' && params.destination === 'GPS') throw new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE' });
      return withFlights(params);
    });
    const report = await loadOffers(deps);
    expect(report.failed).toEqual([{ origin: 'GYE', destination: 'GPS' }]);
    expect(report.offers).toHaveLength(POPULAR_ROUTES.length - 1);
    expect(report.rateLimited).toBeNull();
    expect(stats.calls.filter((c) => c.origin === 'GYE' && c.destination === 'GPS')).toHaveLength(1);
  });

  it('un error no se guarda en caché: al reintentar solo se pide lo que falló', async () => {
    let failing = true;
    const { deps, search } = setup((params) => {
      if (failing && params.origin === 'GYE' && params.destination === 'GPS') throw new ApiError({ status: 0, code: 'NETWORK' });
      return withFlights(params);
    });
    await loadOffers(deps);
    const afterFirst = search.mock.calls.length;
    failing = false;
    const retry = await loadOffers(deps);
    expect(search.mock.calls.length - afterFirst).toBe(1);
    expect(retry.searches).toBe(1);
    expect(retry.offers).toHaveLength(POPULAR_ROUTES.length);
    expect(retry.failed).toEqual([]);
  });

  it('cancelar a mitad de la carga: pasa la señal a la búsqueda, no manda nada más y no cuenta como falla', async () => {
    const controller = new AbortController();
    const { deps, search } = setup((params, options) => {
      // La búsqueda en vuelo se corta cuando se cancela, como hace el cliente HTTP.
      return new Promise<SearchResult>((resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(new ApiError({ status: 0, code: 'ABORTED' })));
        setTimeout(() => resolve(withFlights(params)), 50);
      });
    });
    const pending = loadOffers(deps, { signal: controller.signal });
    await later(10);
    expect(search).toHaveBeenCalledTimes(2);
    controller.abort();
    const report = await pending;
    expect(report.aborted).toBe(true);
    expect(report.failed).toEqual([]);
    expect(report.rateLimited).toBeNull();
    await later(70);
    expect(search).toHaveBeenCalledTimes(2);
    expect(search.mock.calls.every(([, options]) => options.signal === controller.signal)).toBe(true);
  });

  it('con la señal ya cancelada no envía ninguna búsqueda', async () => {
    const controller = new AbortController();
    controller.abort();
    const { deps, search } = setup();
    const report = await loadOffers(deps, { signal: controller.signal });
    expect(search).not.toHaveBeenCalled();
    expect(report.aborted).toBe(true);
    expect(report.skipped).toHaveLength(POPULAR_ROUTES.length);
  });

  it('no busca fechas después del último día con vuelos', async () => {
    const { deps, search } = setup(withFlights, { lastDate: () => new Date(2026, 9, 12) });
    const report = await loadOffers(deps);
    expect(search).not.toHaveBeenCalled();
    expect(report.noFlights).toHaveLength(POPULAR_ROUTES.length);
  });
});
