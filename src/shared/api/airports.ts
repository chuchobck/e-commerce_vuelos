/**
 * Catálogo de aeropuertos que la API puede buscar.
 *
 * La API pública no tiene un endpoint de aeropuertos, así que esta lista es ESTÁTICA y sale de la
 * semilla del backend (db/semilla_vuelos.sql). Si el backend agrega o quita un aeropuerto, hay
 * que actualizarla aquí (hay una prueba que la compara con los códigos válidos conocidos).
 */
export type RegionId = 'galapagos' | 'costa' | 'andes' | 'amazonia';

export interface Airport {
  /** Código IATA. */
  code: string;
  /** Ciudad tal como la nombra la semilla. */
  city: string;
  name: string;
  region: RegionId;
  timeZone: 'America/Guayaquil' | 'Pacific/Galapagos';
}

export const AIRPORTS: readonly Airport[] = [
  { code: 'UIO', city: 'Quito', name: 'Aeropuerto Internacional Mariscal Sucre', region: 'andes', timeZone: 'America/Guayaquil' },
  { code: 'GYE', city: 'Guayaquil', name: 'Aeropuerto Internacional José Joaquín de Olmedo', region: 'costa', timeZone: 'America/Guayaquil' },
  { code: 'CUE', city: 'Cuenca', name: 'Aeropuerto Mariscal Lamar', region: 'andes', timeZone: 'America/Guayaquil' },
  { code: 'LOH', city: 'Loja', name: 'Aeropuerto Camilo Ponce Enríquez', region: 'andes', timeZone: 'America/Guayaquil' },
  { code: 'MEC', city: 'Manta', name: 'Aeropuerto Internacional Eloy Alfaro', region: 'costa', timeZone: 'America/Guayaquil' },
  { code: 'ESM', city: 'Esmeraldas', name: 'Aeropuerto Carlos Concha Torres', region: 'costa', timeZone: 'America/Guayaquil' },
  { code: 'LGQ', city: 'Nueva Loja', name: 'Aeropuerto Lago Agrio', region: 'amazonia', timeZone: 'America/Guayaquil' },
  { code: 'OCC', city: 'Coca', name: 'Aeropuerto Francisco de Orellana', region: 'amazonia', timeZone: 'America/Guayaquil' },
  { code: 'GPS', city: 'Baltra', name: 'Aeropuerto Seymour', region: 'galapagos', timeZone: 'Pacific/Galapagos' },
  { code: 'SCY', city: 'San Cristóbal', name: 'Aeropuerto San Cristóbal', region: 'galapagos', timeZone: 'Pacific/Galapagos' },
];

/**
 * Destinos con vuelos desde cada origen (directos o con una escala de la misma aerolínea).
 * Verificado con búsquedas reales contra la API el 2026-10-07: cada par devolvió ofertas en al
 * menos una de 7 fechas consecutivas. Los pares que no están aquí no tienen vuelos y no se ofrecen.
 */
const DESTINATIONS_FROM: Record<string, readonly string[]> = {
  UIO: ['GYE', 'CUE', 'LOH', 'MEC', 'ESM', 'LGQ', 'OCC', 'GPS', 'SCY'],
  GYE: ['UIO', 'CUE', 'MEC', 'ESM', 'OCC', 'GPS', 'SCY'],
  CUE: ['UIO', 'GYE', 'GPS', 'SCY'],
  LOH: ['UIO', 'GYE', 'CUE', 'MEC', 'ESM'],
  MEC: ['UIO', 'GYE'],
  ESM: ['UIO', 'GYE', 'CUE', 'OCC'],
  LGQ: ['UIO', 'GYE', 'CUE', 'MEC', 'OCC'],
  OCC: ['UIO', 'GYE', 'LOH', 'MEC', 'ESM'],
  GPS: ['UIO', 'GYE'],
  SCY: ['UIO', 'GYE'],
};

export function destinationsFrom(origin: string): readonly string[] {
  return DESTINATIONS_FROM[origin.toUpperCase()] ?? [];
}

export function hasFlights(origin: string, destination: string): boolean {
  return destinationsFrom(origin).includes(destination.toUpperCase());
}

/** Ecuador no cambia de horario: desfase fijo respecto de UTC, en minutos. */
const UTC_OFFSET_MINUTES: Record<Airport['timeZone'], number> = {
  'America/Guayaquil': -300,
  'Pacific/Galapagos': -360,
};

export function findAirport(code: string): Airport | undefined {
  return AIRPORTS.find((a) => a.code === code.toUpperCase());
}

/** Ciudad de un código, o el código si no está en el catálogo. */
export function cityOf(code: string): string {
  return findAirport(code)?.city ?? code;
}

/** Desfase del aeropuerto (Quito por defecto si el código no está en el catálogo). */
export function airportOffsetMinutes(code: string): number {
  const airport = findAirport(code);
  return UTC_OFFSET_MINUTES[airport?.timeZone ?? 'America/Guayaquil'];
}
