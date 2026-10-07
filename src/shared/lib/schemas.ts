import { z } from 'zod';
import { es, fmt } from '@/shared/i18n';
import { EMAIL_MAX_LENGTH, isValidEmail, normalizeEmail, passwordLengthIssue } from './credentials';
import { ageOn, lastFlightDate, parseDisplayDate, toDisplayDate, today } from './dates';
import {
  FLIGHT_NUMBER_PATTERN,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  PASSPORT_PATTERN,
  compactDocument,
  PHONE_EC_PATTERN,
  isFutureExpiry,
  isValidCedula,
  isValidExpiryFormat,
  isValidLuhn,
} from './validators';

/**
 * Campos zod reutilizables. Cada mensaje dice qué pasó y cómo arreglarlo.
 * Los esquemas de cada feature (src/features/<x>/schemas) los componen.
 */
const v = es.validation;

export const nameField = z
  .string()
  .trim()
  .min(1, v.required)
  .max(NAME_MAX_LENGTH, v.nameLength)
  .regex(NAME_PATTERN, v.nameInvalid);

export const cedulaField = z
  .string()
  .trim()
  .min(1, v.required)
  .length(10, v.cedulaLength)
  .refine(isValidCedula, v.cedulaInvalid);

export const passportField = z.string().trim().min(1, v.required).transform(compactDocument).pipe(z.string().regex(PASSPORT_PATTERN, v.passportInvalid));

/** Correo: misma normalización y validación que el backend (shared/lib/credentials.ts). */
export const emailField = z
  .string()
  .transform(normalizeEmail)
  .pipe(
    z
      .string()
      .min(1, v.required)
      .max(EMAIL_MAX_LENGTH, v.emailLength)
      .refine(isValidEmail, v.emailInvalid),
  );

/** Solo los 9 dígitos posteriores a +593 (el prefijo se muestra fijo). */
export const phoneField = z.string().trim().min(1, v.required).regex(PHONE_EC_PATTERN, v.phoneInvalid);

/**
 * Contraseña: solo longitud, de 12 a 128 caracteres tras normalizar a NFKC y sin recortar, como el
 * backend. Sin reglas de composición (WCAG 3.3.8 y NIST SP 800-63B). Se envía tal cual la escribió.
 */
export const passwordField = z.string().superRefine((value, ctx) => {
  if (value.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: v.required });
  else if (passwordLengthIssue(value) === 'short') ctx.addIssue({ code: z.ZodIssueCode.custom, message: v.passwordLength });
  else if (passwordLengthIssue(value) === 'long') ctx.addIssue({ code: z.ZodIssueCode.custom, message: v.passwordMax });
});

export const flightNumberField = z
  .string()
  .trim()
  .min(1, v.required)
  .regex(FLIGHT_NUMBER_PATTERN, v.flightNumber)
  .transform((s) => s.toUpperCase());

/** Fecha visible "dd/mm/aaaa" que debe ser hoy o futura y dentro de la ventana de venta. */
export const futureDateField = z
  .string()
  .trim()
  .min(1, v.required)
  .refine((s) => parseDisplayDate(s) !== null, v.dateInvalid)
  .refine((s) => {
    const d = parseDisplayDate(s);
    return !d || d >= today();
  }, v.datePast)
  .refine(
    (s) => {
      const d = parseDisplayDate(s);
      return !d || d <= lastFlightDate();
    },
    () => ({ message: fmt(v.dateTooFar, { date: toDisplayDate(lastFlightDate()) }) }),
  );

/** Fecha opcional con las mismas reglas cuando tiene valor. */
export const optionalFutureDateField = z.union([z.literal(''), futureDateField]);

/** Tipos de pasajero del contrato (PassengerItem.passengerType). */
export type PassengerType = 'ADULT' | 'YOUTH' | 'CHILD' | 'INFANT';

/**
 * Valida la fecha de nacimiento (dd/mm/aaaa) según el tipo de pasajero, como el backend: la edad
 * cuenta el día del PRIMER vuelo (adulto ≥ 18, joven 12–17, niño 2–11, infante < 2) y un infante
 * además debe seguir siendo menor de 2 el día del ÚLTIMO vuelo.
 */
export function birthDateMessage(birth: string, type: PassengerType, flightDate: Date, lastFlightDate: Date = flightDate): string | null {
  const d = parseDisplayDate(birth);
  if (!d) return v.dateInvalid;
  if (d > today()) return v.birthFuture;
  const age = ageOn(d, flightDate);
  if (type === 'ADULT' && age < 18) return v.birthAdult;
  if (type === 'YOUTH' && (age < 12 || age > 17)) return v.birthYouth;
  if (type === 'CHILD' && (age < 2 || age > 11)) return v.birthChild;
  if (type === 'INFANT' && (age >= 2 || ageOn(d, lastFlightDate) >= 2)) return v.birthInfant;
  return null;
}

export function birthDateField(type: PassengerType, flightDate: Date) {
  return z
    .string()
    .trim()
    .min(1, v.required)
    .superRefine((value, ctx) => {
      const message = birthDateMessage(value, type, flightDate);
      if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    });
}

/** Documento: cédula (módulo 10) o pasaporte alfanumérico. */
export const documentSchema = z.discriminatedUnion('documentType', [
  z.object({ documentType: z.literal('NATIONAL_ID'), documentNumber: cedulaField }),
  z.object({ documentType: z.literal('PASSPORT'), documentNumber: passportField }),
]);

/** Tarjeta simulada. */
export const cardNumberField = z
  .string()
  .min(1, v.required)
  .regex(/^\d{13,19}$/, v.cardLength)
  .refine(isValidLuhn, v.cardInvalid);

export const cardExpiryField = z
  .string()
  .min(1, v.required)
  .refine(isValidExpiryFormat, v.expiryInvalid)
  .refine((s) => !isValidExpiryFormat(s) || isFutureExpiry(s), v.expiryPast);

export const cvvField = z.string().min(1, v.required).regex(/^\d{3,4}$/, v.cvvInvalid);
