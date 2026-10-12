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

/** Días máximos de un mes (febrero con 29: el año aún puede no estar escrito). */
const MAX_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Decide qué dígitos entran en cada posición de "ddmmaaaa" para que no se pueda escribir una fecha imposible:
 * día 01–31, mes 01–12, el día dentro de los que tiene el mes y un año 1900–2199. Un primer dígito que solo puede ser
 * el segundo ("5" de día, "4" de mes) completa el cero solo ("05"). Devuelve lo que se agrega, o `null` si el dígito no entra.
 */
function acceptDigit(out: string, digit: string): string | null {
  const d = Number(digit);
  switch (out.length) {
    case 0:
      return d <= 3 ? digit : `0${digit}`;
    case 1: {
      const day = Number(out + digit);
      return day >= 1 && day <= 31 ? digit : null;
    }
    case 2: {
      const append = d <= 1 ? digit : `0${digit}`;
      // Con el mes completo ("04"), el día escrito debe existir en ese mes.
      return append.length === 2 && Number(out.slice(0, 2)) > MAX_DAYS[Number(append) - 1] ? null : append;
    }
    case 3: {
      const month = Number(out[2] + digit);
      if (month < 1 || month > 12) return null;
      return Number(out.slice(0, 2)) > MAX_DAYS[month - 1] ? null : digit;
    }
    case 4:
      return d === 1 || d === 2 ? digit : null;
    case 5:
      return (out[4] === '1' && d === 9) || (out[4] === '2' && d <= 1) ? digit : null;
    default:
      return digit;
  }
}

/**
 * Inserta las barras mientras el usuario escribe una fecha y solo deja pasar dígitos que forman una fecha posible
 * (no hay mes 13 ni día 32: simplemente no se escriben). Nunca muestra un error por eso y nunca borra lo ya escrito.
 */
export function maskDateInput(raw: string): string {
  let out = '';
  for (const digit of raw.replace(/\D/g, '')) {
    if (out.length >= 8) break;
    const accepted = acceptDigit(out, digit);
    if (accepted !== null) out += accepted;
  }
  if (out.length <= 2) return out;
  if (out.length <= 4) return `${out.slice(0, 2)}/${out.slice(2)}`;
  return `${out.slice(0, 2)}/${out.slice(2, 4)}/${out.slice(4)}`;
}
