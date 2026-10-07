import { describe, expect, it } from 'vitest';
import { AIRPORTS, destinationsFrom, hasFlights } from './airports';
import { mockSearch } from './mock/generators';

/**
 * Aeropuertos de la semilla del backend (db/semilla_vuelos.sql, sección 1). Si el backend cambia
 * su red, esta prueba falla hasta que se actualice el catálogo estático de airports.ts.
 */
const SEED_CODES = ['UIO', 'GYE', 'CUE', 'LOH', 'MEC', 'ESM', 'LGQ', 'OCC', 'GPS', 'SCY'];

describe('catálogo de aeropuertos', () => {
  it('ofrece exactamente los aeropuertos que la API puede buscar', () => {
    expect(AIRPORTS.map((a) => a.code).sort()).toEqual([...SEED_CODES].sort());
  });

  it('no ofrece destinos que no existen (Latacunga, Macas…)', () => {
    for (const code of ['LTX', 'XMS']) expect(AIRPORTS.some((a) => a.code === code)).toBe(false);
  });

  it('la tabla de pares solo usa aeropuertos del catálogo y nunca el mismo origen y destino', () => {
    for (const origin of SEED_CODES) {
      for (const destination of destinationsFrom(origin)) {
        expect(SEED_CODES).toContain(destination);
        expect(destination).not.toBe(origin);
      }
    }
  });

  it('Galápagos y Cuenca: hay ida CUE→GPS pero no vuelta GPS→CUE (verificado contra la API)', () => {
    expect(hasFlights('CUE', 'GPS')).toBe(true);
    expect(hasFlights('GPS', 'CUE')).toBe(false);
  });
});

describe('el mock tiene la misma red que la API real', () => {
  // Día fijo para que la prueba no dependa de la fecha en que corre.
  const NOW = Date.parse('2026-10-07T12:00:00Z');
  const dates = Array.from({ length: 7 }, (_, i) => new Date(NOW + (i + 3) * 86_400_000).toISOString().slice(0, 10));

  it.each(SEED_CODES)('desde %s', (origin) => {
    const reachable = SEED_CODES.filter(
      (destination) =>
        destination !== origin &&
        dates.some(
          (departureDate) =>
            mockSearch({ itineraries: [{ origin, destination, departureDate }], passengers: { adults: 1 } }, NOW).totalOffers > 0,
        ),
    );
    expect(reachable.sort()).toEqual([...destinationsFrom(origin)].sort());
  });
});
