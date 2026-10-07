/** Utilidades deterministas para que el mock devuelva siempre los mismos vuelos por fecha. */

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Generador pseudoaleatorio con semilla (mulberry32). */
export function seeded(seed: string | number) {
  let a = typeof seed === 'number' ? seed : hashString(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rand: () => number, min: number, max: number) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode(length = 6) {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

export function randomId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Distancia en km entre dos coordenadas (fórmula de haversine). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Convierte un instante UTC en ISO con el desfase local del aeropuerto, p. ej. 2026-10-10T07:45:00-05:00. */
export function toZonedIso(utcMs: number, offsetMinutes: number): string {
  const local = new Date(utcMs + offsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const sign = offsetMinutes <= 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

/** Instante UTC de una hora local de un día "yyyy-MM-dd". */
export function localToUtcMs(date: string, minutesOfDay: number, offsetMinutes: number): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d, 0, minutesOfDay) - offsetMinutes * 60_000;
}
