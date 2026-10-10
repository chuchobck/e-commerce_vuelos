import { describe, expect, it } from 'vitest';
import { apiConfig, flightsApi } from '@/shared/api';
import { createTtlCache } from '@/shared/lib/ttlCache';
import type { Offer } from './cheapestOffer';
import { loadOffers } from './loadOffers';
import { OFFERS, POPULAR_ROUTES } from './popularRoutes';

/**
 * Con VITE_API_URL vacía el inicio tiene que verse completo: el mock devuelve vuelos reales de la tabla de la semilla para
 * cada ruta popular y en las fechas que pide la sección, con variedad de precios y horarios.
 */
describe('el mock cubre las ofertas del inicio', () => {
  it('estas pruebas corren contra el mock', () => {
    expect(apiConfig.usingMock).toBe(true);
  });

  it('cada ruta popular tiene oferta cualquiera que sea el día de la semana, sin errores y dentro del presupuesto', async () => {
    // Algunas rutas (Loja, con escala por Quito) no vuelan todos los días: se prueban las 7 salidas posibles de la semana.
    for (let offset = 0; offset < 7; offset++) {
      const today = () => new Date(Date.now() + offset * 86_400_000);
      const report = await loadOffers({ search: (params, options) => flightsApi.search(params, options), cache: createTtlCache<Offer | null>(`test.coverage.${offset}`, OFFERS.ttlMs), today });
      expect(report.failed, `día +${offset}`).toEqual([]);
      expect(report.rateLimited).toBeNull();
      expect(report.noFlights).toEqual([]);
      expect(report.skipped).toEqual([]);
      expect(report.offers).toHaveLength(POPULAR_ROUTES.length);
      expect(report.searches).toBeGreaterThanOrEqual(POPULAR_ROUTES.length);
      expect(report.searches).toBeLessThanOrEqual(OFFERS.budget);
    }
  }, 60_000);

  it('hay variedad de precios y de horarios, todo en la moneda de la respuesta y de menor a mayor (un martes, cuando vuelan todas las rutas)', async () => {
    // La primera fecha que se busca es hoy + 3 días: se elige un «hoy» para que caiga en martes y la prueba no dependa de cuándo corre.
    const now = new Date();
    const today = () => new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((((2 - now.getDay() - OFFERS.firstDayOffset) % 7) + 7) % 7));
    const { offers } = await loadOffers({ search: (params, options) => flightsApi.search(params, options), cache: createTtlCache<Offer | null>('test.coverage2', OFFERS.ttlMs), today });
    expect(offers).toHaveLength(POPULAR_ROUTES.length);
    const prices = offers.map((o) => o.price.cents);
    expect(new Set(prices).size).toBe(prices.length);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(Math.max(...prices)).toBeGreaterThan(prices[0] * 3); // Galápagos cuesta varias veces lo de Quito–Guayaquil
    expect(new Set(offers.map((o) => o.departureTime.slice(11, 16))).size).toBeGreaterThanOrEqual(3);
    expect(new Set(offers.map((o) => o.airline.code)).size).toBeGreaterThanOrEqual(2);
    expect(offers.every((o) => o.price.currency === 'USD' && o.seatsLeft > 0 && o.flightNumbers.length >= 1)).toBe(true);
    // Una de las rutas es con escala (Loja–Cuenca no tiene vuelo directo en la semilla): la tarjeta lo dice.
    expect(offers.some((o) => o.stops > 0)).toBe(true);
  }, 30_000);
});
