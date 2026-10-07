import { addDays, differenceInYears, format, isValid, parse, startOfDay } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';

/** Formato visible para el usuario. */
export const DISPLAY_DATE = 'dd/MM/yyyy';
/** Formato de intercambio (URL y API). */
export const ISO_DATE = 'yyyy-MM-dd';
/** Máximo de días hacia adelante que se pueden comprar. */
export const MAX_BOOKING_DAYS = 330;

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

export function maxBookingDate(): Date {
  return addDays(today(), MAX_BOOKING_DAYS);
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
