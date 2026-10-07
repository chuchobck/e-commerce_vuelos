/**
 * Validadores puros (sin dependencias de UI). Se usan desde los esquemas zod.
 */

/** Letras (incluye tildes y ñ), espacios, apóstrofe y guion. */
export const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]+$/;
export const PASSPORT_PATTERN = /^[A-Za-z0-9]{6,12}$/;
export const PHONE_EC_PATTERN = /^9\d{8}$/;
export const FLIGHT_NUMBER_PATTERN = /^QD\d{3,4}$/i;

/** Elimina todo lo que no sea dígito (para teclear y pegar en campos numéricos). */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
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
