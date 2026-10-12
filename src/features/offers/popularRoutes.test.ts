import { describe, expect, it } from 'vitest';
import { findAirport, hasFlights } from '@/shared/api';
import { OFFERS, POPULAR_ROUTES } from './popularRoutes';

describe('rutas populares', () => {
  it('todas existen en el catálogo de aeropuertos y tienen vuelos (la tabla de pares de la semilla)', () => {
    for (const { origin, destination } of POPULAR_ROUTES) {
      expect(findAirport(origin), origin).toBeDefined();
      expect(findAirport(destination), destination).toBeDefined();
      expect(hasFlights(origin, destination), `${origin}-${destination}`).toBe(true);
    }
  });

  it('no hay rutas repetidas ni de un lugar a sí mismo', () => {
    const keys = POPULAR_ROUTES.map((r) => `${r.origin}-${r.destination}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(POPULAR_ROUTES.every((r) => r.origin !== r.destination)).toBe(true);
  });

  it('el presupuesto de una carga cubre todas las rutas y respeta el tope de la API', () => {
    expect(POPULAR_ROUTES.length).toBeLessThanOrEqual(OFFERS.budget);
    expect(OFFERS).toMatchObject({ limit: 6, budget: 8, concurrency: 2, dateAttempts: 3, firstDayOffset: 3, ttlMs: 600_000 });
    // 20 búsquedas por minuto por IP: una carga no puede acercarse a ese límite.
    expect(OFFERS.budget).toBeLessThan(20);
  });
});
