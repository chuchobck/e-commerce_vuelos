import { z } from 'zod';
import { es } from '@/shared/i18n';
import { ageOn, maxBookingDate, parseDisplayDate, today } from './dates';
import {
  BOOKING_CODE_PATTERN,
  FLIGHT_NUMBER_PATTERN,
  NAME_PATTERN,
  PASSPORT_PATTERN,
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
  .min(2, v.nameLength)
  .max(40, v.nameLength)
  .regex(NAME_PATTERN, v.nameInvalid);

export const cedulaField = z
  .string()
  .trim()
  .min(1, v.required)
  .length(10, v.cedulaLength)
  .refine(isValidCedula, v.cedulaInvalid);

export const passportField = z.string().trim().min(1, v.required).regex(PASSPORT_PATTERN, v.passportInvalid);

export const emailField = z.string().trim().min(1, v.required).max(100, v.emailLength).email(v.emailInvalid);

/** Solo los 9 dígitos posteriores a +593 (el prefijo se muestra fijo). */
export const phoneField = z.string().trim().min(1, v.required).regex(PHONE_EC_PATTERN, v.phoneInvalid);

/** Contraseña: sin reglas de composición cognitivas; solo longitud (WCAG 3.3.8). */
export const passwordField = z.string().min(1, v.required).min(8, v.passwordLength).max(64, v.passwordMax);

export const bookingCodeField = z
  .string()
  .trim()
  .min(1, v.required)
  .regex(BOOKING_CODE_PATTERN, v.bookingCode)
  .transform((s) => s.toUpperCase());

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
  .refine((s) => {
    const d = parseDisplayDate(s);
    return !d || d <= maxBookingDate();
  }, v.dateTooFar);

/** Fecha opcional con las mismas reglas cuando tiene valor. */
export const optionalFutureDateField = z.union([z.literal(''), futureDateField]);

export type PassengerType = 'ADT' | 'CHD' | 'INF';

/**
 * Valida la fecha de nacimiento según el tipo de pasajero, en la fecha del vuelo:
 * adulto ≥ 12 años, niño 2–11, infante < 2.
 */
export function birthDateMessage(birth: string, type: PassengerType, flightDate: Date): string | null {
  const d = parseDisplayDate(birth);
  if (!d) return v.dateInvalid;
  if (d > today()) return v.birthFuture;
  const age = ageOn(d, flightDate);
  if (type === 'ADT' && age < 12) return v.birthAdult;
  if (type === 'CHD' && (age < 2 || age > 11)) return v.birthChild;
  if (type === 'INF' && age >= 2) return v.birthInfant;
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
  z.object({ documentType: z.literal('CEDULA'), documentNumber: cedulaField }),
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
