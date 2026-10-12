/**
 * Validadores puros (sin dependencias de UI). Se usan desde los esquemas zod.
 */

/**
 * Nombre como el DTO del backend (PasajeroReservaDto): empieza con una letra y sigue con letras
 * (cualquier alfabeto, con tildes), espacios, apóstrofe, punto o guion; sin dígitos.
 */
export const NAME_PATTERN = /^\p{L}[\p{L}\p{M} '.-]*$/u;
export const NAME_MAX_LENGTH = 60;
/** Documento como el backend: 5 a 20 letras o dígitos, después de quitar espacios y guiones y pasar a mayúsculas. */
export const PASSPORT_PATTERN = /^[A-Z0-9]{5,20}$/;

/** Como el backend: quita espacios, guiones, puntos y paréntesis ("AB-123 456" → "AB123456"). */
export function compactDocument(value: string): string {
  return value.replace(/[\s().-]/g, '').toUpperCase();
}
export const PHONE_EC_PATTERN = /^9\d{8}$/;
/** Como la API: aerolínea IATA (2 caracteres) y número sin ceros a la izquierda, p. ej. LA1400 o AV45. */
export const FLIGHT_NUMBER_PATTERN = /^[A-Z0-9]{2}[1-9][0-9]{0,3}$/i;

/** Elimina todo lo que no sea dígito (para teclear y pegar en campos numéricos). */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Nombres de personas (pasajeros, titular de la tarjeta): solo letras (con tildes y ñ) y espacios. Lo demás se quita al
 * teclear y al pegar, sin mensaje de error: los números y signos simplemente no entran. No empieza con espacio ni
 * lleva espacios seguidos.
 */
export function onlyLetters(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[^\p{L}\p{M} ]+/gu, '')
    .replace(/^ +/, '')
    .replace(/ {2,}/g, ' ');
}

/** Número de vuelo mientras se escribe: mayúsculas, sin espacios ni signos ("la 1400" → "LA1400"). */
export function sanitizeFlightNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

/**
 * Cédula ecuatoriana: 10 dígitos, provincia 01–24 (o 30 para ecuatorianos en el exterior),
 * tercer dígito < 6 (persona natural) y dígito verificador por módulo 10.
 */
export function isValidCedula(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const province = Number(value.slice(0, 2));
  if (!((province >= 1 && province <= 24) || province === 30)) return false;
  const third = Number(value[2]);
  if (third >= 6) return false;

  const coefficients = [2, 1, 2, 1, 2, 1, 2, 1, 2];
  const sum = coefficients.reduce((acc, coef, i) => {
    let product = Number(value[i]) * coef;
    if (product >= 10) product -= 9;
    return acc + product;
  }, 0);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(value[9]);
}

/** Algoritmo de Luhn para tarjetas (simuladas). */
export function isValidLuhn(value: string): boolean {
  if (!/^\d{13,19}$/.test(value)) return false;
  let sum = 0;
  let double = false;
  for (let i = value.length - 1; i >= 0; i--) {
    let digit = Number(value[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Vencimiento "MM/AA" en el futuro (válida hasta el último día del mes). */
export function isFutureExpiry(value: string, now: Date = new Date()): boolean {
  const match = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  const endOfMonth = new Date(year, month, 0, 23, 59, 59);
  return endOfMonth >= now;
}

export function isValidExpiryFormat(value: string): boolean {
  const match = /^(\d{2})\/(\d{2})$/.exec(value);
  return !!match && Number(match[1]) >= 1 && Number(match[1]) <= 12;
}
