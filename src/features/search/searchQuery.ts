import type { Cabin, SearchParams } from '@/shared/api';
import { displayToIso, isoToDisplay, parseIsoDate } from '@/shared/lib/dates';
import { CABINS, MAX_PASSENGERS, SEARCH_DEFAULTS, type SearchFormInput } from './searchSchema';

/**
 * La búsqueda vive en la URL (/resultados?origen=UIO&destino=GYE&ida=2026-10-12…)
 * para que se pueda compartir, recargar y volver atrás sin perder datos.
 */
const KEYS = {
  origin: 'origen',
  destination: 'destino',
  departDate: 'ida',
  returnDate: 'vuelta',
  adults: 'adultos',
  children: 'ninos',
  infants: 'infantes',
  cabin: 'cabina',
} as const;

const IATA = /^[A-Z]{3}$/;

export function formToQuery(values: SearchFormInput): string {
  const q = new URLSearchParams();
  q.set(KEYS.origin, values.origin);
  q.set(KEYS.destination, values.destination);
  q.set(KEYS.departDate, displayToIso(values.departDate));
  if (values.tripType === 'ROUND' && values.returnDate) q.set(KEYS.returnDate, displayToIso(values.returnDate));
  q.set(KEYS.adults, String(values.adults));
  q.set(KEYS.children, String(values.children));
  q.set(KEYS.infants, String(values.infants));
  q.set(KEYS.cabin, values.cabin);
  return q.toString();
}

function count(q: URLSearchParams, key: string, fallback: number) {
  const raw = q.get(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= MAX_PASSENGERS ? n : fallback;
}

function code(q: URLSearchParams, key: string) {
  const raw = (q.get(key) ?? '').toUpperCase();
  return IATA.test(raw) ? raw : '';
}

/** Valores iniciales del formulario a partir de la URL (p. ej. "Modificar búsqueda" o un destino sugerido). */
export function queryToForm(q: URLSearchParams): SearchFormInput {
  const cabin = q.get(KEYS.cabin);
  const returnDate = isoToDisplay(q.get(KEYS.returnDate));
  // Una búsqueda guardada sin fecha de regreso es "Solo ida"; sin búsqueda, por defecto "Ida y vuelta".
  const hasSearch = q.has(KEYS.departDate);
  return {
    tripType: returnDate || !hasSearch ? 'ROUND' : 'ONE_WAY',
    origin: code(q, KEYS.origin),
    destination: code(q, KEYS.destination),
    departDate: isoToDisplay(q.get(KEYS.departDate)),
    returnDate,
    adults: Math.max(1, count(q, KEYS.adults, SEARCH_DEFAULTS.adults)),
    children: count(q, KEYS.children, 0),
    infants: count(q, KEYS.infants, 0),
    cabin: CABINS.includes(cabin as Cabin) ? (cabin as Cabin) : SEARCH_DEFAULTS.cabin,
  };
}

/** Parámetros para la API, o null si la URL no tiene lo mínimo para buscar. */
export function queryToSearch(q: URLSearchParams): SearchParams | null {
  const f = queryToForm(q);
  const departDate = q.get(KEYS.departDate) ?? '';
  const returnDate = q.get(KEYS.returnDate) ?? '';
  if (!f.origin || !f.destination || f.origin === f.destination || !parseIsoDate(departDate)) return null;
  const total = f.adults + f.children + f.infants;
  if (total > MAX_PASSENGERS || f.infants > f.adults) return null;
  return {
    origin: f.origin,
    destination: f.destination,
    departDate,
    returnDate: parseIsoDate(returnDate) ? returnDate : undefined,
    passengers: { adults: f.adults, children: f.children, infants: f.infants },
    cabin: f.cabin,
  };
}
