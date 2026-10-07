import type { Airport } from '../../types';

/** Aeropuertos comerciales de Ecuador (datos reales de ubicación). */
export const AIRPORTS: Airport[] = [
  { code: 'UIO', city: 'Quito', name: 'Aeropuerto Internacional Mariscal Sucre', province: 'Pichincha', timeZone: 'America/Guayaquil', lat: -0.1292, lon: -78.3575 },
  { code: 'GYE', city: 'Guayaquil', name: 'Aeropuerto Internacional José Joaquín de Olmedo', province: 'Guayas', timeZone: 'America/Guayaquil', lat: -2.1574, lon: -79.8837 },
  { code: 'CUE', city: 'Cuenca', name: 'Aeropuerto Mariscal Lamar', province: 'Azuay', timeZone: 'America/Guayaquil', lat: -2.8895, lon: -78.9844 },
  { code: 'GPS', city: 'Galápagos (Baltra)', name: 'Aeropuerto Ecológico Seymour', province: 'Galápagos', timeZone: 'Pacific/Galapagos', lat: -0.4538, lon: -90.2659 },
  { code: 'SCY', city: 'San Cristóbal (Galápagos)', name: 'Aeropuerto de San Cristóbal', province: 'Galápagos', timeZone: 'Pacific/Galapagos', lat: -0.9102, lon: -89.6175 },
  { code: 'LTX', city: 'Latacunga', name: 'Aeropuerto Internacional Cotopaxi', province: 'Cotopaxi', timeZone: 'America/Guayaquil', lat: -0.9068, lon: -78.6158 },
  { code: 'MEC', city: 'Manta', name: 'Aeropuerto Internacional Eloy Alfaro', province: 'Manabí', timeZone: 'America/Guayaquil', lat: -0.9461, lon: -80.6788 },
  { code: 'LOH', city: 'Loja', name: 'Aeropuerto Ciudad de Catamayo', province: 'Loja', timeZone: 'America/Guayaquil', lat: -3.9959, lon: -79.3719 },
  { code: 'OCC', city: 'Coca', name: 'Aeropuerto Francisco de Orellana', province: 'Orellana', timeZone: 'America/Guayaquil', lat: -0.4629, lon: -76.9868 },
  { code: 'LGQ', city: 'Lago Agrio', name: 'Aeropuerto de Nueva Loja', province: 'Sucumbíos', timeZone: 'America/Guayaquil', lat: 0.0931, lon: -76.8675 },
  { code: 'ESM', city: 'Esmeraldas', name: 'Aeropuerto Carlos Concha Torres', province: 'Esmeraldas', timeZone: 'America/Guayaquil', lat: 0.9785, lon: -79.6266 },
  { code: 'XMS', city: 'Macas', name: 'Aeropuerto Coronel Edmundo Carvajal', province: 'Morona Santiago', timeZone: 'America/Guayaquil', lat: -2.2992, lon: -78.1208 },
];

/** Diferencia con UTC en minutos para cada zona (Ecuador no usa horario de verano). */
export const UTC_OFFSET_MINUTES: Record<Airport['timeZone'], number> = {
  'America/Guayaquil': -300,
  'Pacific/Galapagos': -360,
};

export function findAirport(code: string): Airport | undefined {
  return AIRPORTS.find((a) => a.code === code.toUpperCase());
}
