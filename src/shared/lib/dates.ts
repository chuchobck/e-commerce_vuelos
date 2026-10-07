import { addDays, differenceInYears, format, isValid, parse, startOfDay } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';

/** Formato visible para el usuario. */
const DISPLAY_DATE = 'dd/MM/yyyy';
/** Formato de intercambio (URL y API). */
const ISO_DATE = 'yyyy-MM-dd';
/**
 * La semilla del backend genera salidas para 90 días desde su carga (hoy + 89 días como máximo).
 * Esa ventana es FIJA desde la carga: VITE_LAST_FLIGHT_DATE fija su último día real.
 */
const SEARCH_WINDOW_DAYS = 89;

export const dateLocale = esLocale;

export function today(): Date {
  return startOfDay(new Date());
}

/** Convierte "dd/mm/aaaa" en Date. Devuelve null si no es una fecha real. */
export function parseDisplayDate(value: string): Date | null {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return null;
  const date = parse(value, DISPLAY_DATE, new Date());
  return isValid(date) && format(date, DISPLAY_DATE) === value ? startOfDay(date) : null;
}

export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = parse(value, ISO_DATE, new Date());
  return isValid(date) ? startOfDay(date) : null;
}

export function toDisplayDate(date: Date): string {
  return format(date, DISPLAY_DATE);
}

export function toIsoDate(date: Date): string {
  return format(date, ISO_DATE);
}

export function isoToDisplay(iso: string | null | undefined): string {
  const date = parseIsoDate(iso);
  return date ? toDisplayDate(date) : '';
}

export function displayToIso(display: string): string {
  const date = parseDisplayDate(display);
  return date ? toIsoDate(date) : '';
}

/**
 * Última fecha de salida que se puede buscar: hoy + 89 días, o antes si VITE_LAST_FLIGHT_DATE
 * (yyyy-MM-dd, el último día de la semilla del backend) es anterior.
 */
export function lastFlightDate(configured: string | undefined = import.meta.env.VITE_LAST_FLIGHT_DATE): Date {
  const rolling = addDays(today(), SEARCH_WINDOW_DAYS);
  const fixed = parseIsoDate(configured?.trim());
  return fixed && fixed < rolling ? fixed : rolling;
}

/** Edad cumplida en una fecha de referencia (por ejemplo, la fecha del vuelo). */
export function ageOn(birth: Date, reference: Date): number {
  return differenceInYears(reference, birth);
}

/**
 * Inserta las barras automáticamente mientras el usuario escribe una fecha.
 * Nunca borra lo escrito: solo elimina caracteres que no son dígitos.
 */
export function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
