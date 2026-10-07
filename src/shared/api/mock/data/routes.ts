/**
 * Rutas directas simuladas (se generan en ambos sentidos).
 * Los pares sin ruta directa se ofrecen con 1 escala en UIO o GYE.
 * Galápagos solo se conecta con el continente desde UIO, GYE y LTX, como en la realidad.
 */
export const DIRECT_ROUTES: [string, string][] = [
  ['UIO', 'GYE'],
  ['UIO', 'CUE'],
  ['GYE', 'CUE'],
  ['UIO', 'GPS'],
  ['GYE', 'GPS'],
  ['UIO', 'SCY'],
  ['GYE', 'SCY'],
  ['LTX', 'GPS'],
  ['UIO', 'MEC'],
  ['GYE', 'MEC'],
  ['UIO', 'LOH'],
  ['GYE', 'LOH'],
  ['UIO', 'OCC'],
  ['UIO', 'LGQ'],
  ['UIO', 'ESM'],
  ['UIO', 'XMS'],
  ['GYE', 'LTX'],
];

/** Lista dirigida de rutas; el índice define el número de vuelo (QD{100 + i*10 + franja}). */
export const DIRECTED_ROUTES: [string, string][] = DIRECT_ROUTES.flatMap(([a, b]) => [
  [a, b],
  [b, a],
]);

export const HUBS = ['UIO', 'GYE'];

export const AIRCRAFT_BY_KM = (km: number) => (km > 600 ? 'Airbus A320' : km > 250 ? 'Airbus A319' : 'ATR 72-600');
