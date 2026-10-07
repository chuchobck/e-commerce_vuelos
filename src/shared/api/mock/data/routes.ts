/**
 * Vuelos del mock: copia de la tabla de rutas de la semilla del backend (db/semilla_vuelos.sql,
 * sección 4), para que el mock ofrezca los mismos vuelos, horarios y precios base que la API.
 * Horas locales del aeropuerto de origen; días ISO (1 = lunes … 7 = domingo).
 */
export interface MockRoute {
  airline: 'LA' | 'AV';
  number: string;
  origin: string;
  destination: string;
  /** "HH:mm" local del origen. */
  departs: string;
  durationMin: number;
  aircraft: '320' | '319' | 'AT7';
  days: number[];
  baseUsd: number;
  extraBagUsd: number;
}

const ALL = [1, 2, 3, 4, 5, 6, 7];

type Row = [MockRoute['airline'], string, string, string, string, number, MockRoute['aircraft'], number[], number, number];

const ROWS: Row[] = [
  // Quito <-> Guayaquil
  ['LA', '1400', 'UIO', 'GYE', '06:00', 55, '320', ALL, 55, 15],
  ['LA', '1402', 'UIO', 'GYE', '10:30', 55, '320', ALL, 55, 15],
  ['LA', '1404', 'UIO', 'GYE', '16:00', 55, '320', ALL, 55, 15],
  ['LA', '1406', 'UIO', 'GYE', '20:00', 55, '320', ALL, 55, 15],
  ['AV', '1500', 'UIO', 'GYE', '07:30', 55, '320', ALL, 58, 15],
  ['AV', '1502', 'UIO', 'GYE', '13:00', 55, '320', ALL, 58, 15],
  ['AV', '1504', 'UIO', 'GYE', '18:30', 55, '320', ALL, 58, 15],
  ['LA', '1401', 'GYE', 'UIO', '07:30', 55, '320', ALL, 55, 15],
  ['LA', '1403', 'GYE', 'UIO', '12:00', 55, '320', ALL, 55, 15],
  ['LA', '1405', 'GYE', 'UIO', '17:30', 55, '320', ALL, 55, 15],
  ['LA', '1407', 'GYE', 'UIO', '21:00', 55, '320', ALL, 55, 15],
  ['AV', '1501', 'GYE', 'UIO', '09:00', 55, '320', ALL, 58, 15],
  ['AV', '1503', 'GYE', 'UIO', '14:30', 55, '320', ALL, 58, 15],
  ['AV', '1505', 'GYE', 'UIO', '19:30', 55, '320', ALL, 58, 15],
  // Quito <-> Cuenca
  ['LA', '1430', 'UIO', 'CUE', '07:00', 55, '319', ALL, 60, 15],
  ['LA', '1431', 'CUE', 'UIO', '08:30', 55, '319', ALL, 60, 15],
  ['AV', '1530', 'UIO', 'CUE', '14:00', 55, '319', ALL, 62, 15],
  ['AV', '1531', 'CUE', 'UIO', '15:30', 55, '319', ALL, 62, 15],
  ['LA', '1432', 'UIO', 'CUE', '18:30', 55, '319', [1, 2, 3, 4, 5, 7], 60, 15],
  ['LA', '1433', 'CUE', 'UIO', '20:00', 55, '319', [1, 2, 3, 4, 5, 7], 60, 15],
  // Guayaquil <-> Cuenca
  ['AV', '1542', 'GYE', 'CUE', '09:30', 35, '319', ALL, 40, 15],
  ['AV', '1540', 'GYE', 'CUE', '15:00', 35, '319', ALL, 40, 15],
  ['AV', '1541', 'CUE', 'GYE', '06:30', 35, '319', ALL, 40, 15],
  ['AV', '1543', 'CUE', 'GYE', '16:00', 35, '319', ALL, 40, 15],
  // Quito <-> Loja
  ['AV', '1550', 'UIO', 'LOH', '09:00', 65, 'AT7', [1, 2, 3, 4, 5, 7], 65, 15],
  ['AV', '1551', 'LOH', 'UIO', '10:45', 65, 'AT7', [1, 2, 3, 4, 5, 7], 65, 15],
  ['AV', '1552', 'UIO', 'LOH', '16:00', 65, 'AT7', [1, 3, 5], 65, 15],
  ['AV', '1553', 'LOH', 'UIO', '17:45', 65, 'AT7', [1, 3, 5], 65, 15],
  // Quito <-> Manta
  ['LA', '1440', 'UIO', 'MEC', '07:30', 45, '319', ALL, 50, 15],
  ['LA', '1441', 'MEC', 'UIO', '09:00', 45, '319', ALL, 50, 15],
  ['AV', '1560', 'UIO', 'MEC', '15:00', 45, '319', ALL, 52, 15],
  ['AV', '1561', 'MEC', 'UIO', '16:30', 45, '319', ALL, 52, 15],
  // Quito <-> Esmeraldas
  ['AV', '1570', 'UIO', 'ESM', '06:45', 40, 'AT7', [1, 2, 3, 4, 5, 7], 45, 15],
  ['AV', '1571', 'ESM', 'UIO', '08:15', 40, 'AT7', [1, 2, 3, 4, 5, 7], 45, 15],
  ['AV', '1572', 'UIO', 'ESM', '17:00', 40, 'AT7', [1, 5, 7], 45, 15],
  ['AV', '1573', 'ESM', 'UIO', '18:30', 40, 'AT7', [1, 5, 7], 45, 15],
  // Quito <-> Lago Agrio y Coca
  ['AV', '1580', 'UIO', 'LGQ', '07:00', 40, 'AT7', [1, 2, 3, 4, 5, 6], 50, 15],
  ['AV', '1581', 'LGQ', 'UIO', '08:30', 40, 'AT7', [1, 2, 3, 4, 5, 6], 50, 15],
  ['AV', '1590', 'UIO', 'OCC', '12:00', 40, 'AT7', [1, 3, 5, 7], 55, 15],
  ['AV', '1591', 'OCC', 'UIO', '13:30', 40, 'AT7', [1, 3, 5, 7], 55, 15],
  // Guayaquil <-> Galápagos (Baltra)
  ['LA', '2410', 'GYE', 'GPS', '08:00', 115, '320', ALL, 190, 25],
  ['AV', '2510', 'GYE', 'GPS', '09:30', 115, '320', ALL, 195, 25],
  ['LA', '2412', 'GYE', 'GPS', '12:30', 115, '320', ALL, 190, 25],
  ['LA', '2411', 'GPS', 'GYE', '10:30', 115, '320', ALL, 190, 25],
  ['AV', '2511', 'GPS', 'GYE', '12:00', 115, '320', ALL, 195, 25],
  ['LA', '2413', 'GPS', 'GYE', '13:30', 115, '320', ALL, 190, 25],
  // Guayaquil <-> Galápagos (San Cristóbal)
  ['LA', '2420', 'GYE', 'SCY', '08:30', 110, '320', ALL, 195, 25],
  ['AV', '2520', 'GYE', 'SCY', '10:00', 110, '319', [2, 4, 6], 200, 25],
  ['LA', '2421', 'SCY', 'GYE', '11:00', 110, '320', ALL, 195, 25],
  ['AV', '2521', 'SCY', 'GYE', '12:30', 110, '319', [2, 4, 6], 200, 25],
];

export const ROUTES: MockRoute[] = ROWS.map(([airline, number, origin, destination, departs, durationMin, aircraft, days, baseUsd, extraBagUsd]) => ({
  airline,
  number,
  origin,
  destination,
  departs,
  durationMin,
  aircraft,
  days,
  baseUsd,
  extraBagUsd,
}));

export const AIRLINE_NAMES: Record<MockRoute['airline'], string> = { LA: 'LATAM Airlines', AV: 'Avianca' };

/** Diseño de cabinas por modelo (semilla, sección 2): filas, letras y filas de salida. */
export const CABIN_LAYOUT: Record<MockRoute['aircraft'], { cabin: 'BUSINESS' | 'ECONOMY'; from: number; to: number; letters: string; exitRows: number[] }[]> = {
  '320': [
    { cabin: 'BUSINESS', from: 1, to: 3, letters: 'ACDF', exitRows: [] },
    { cabin: 'ECONOMY', from: 10, to: 30, letters: 'ABCDEF', exitRows: [12, 13] },
  ],
  '319': [
    { cabin: 'BUSINESS', from: 1, to: 2, letters: 'ACDF', exitRows: [] },
    { cabin: 'ECONOMY', from: 7, to: 26, letters: 'ABCDEF', exitRows: [12, 13] },
  ],
  AT7: [{ cabin: 'ECONOMY', from: 1, to: 18, letters: 'ACDF', exitRows: [9, 10] }],
};
