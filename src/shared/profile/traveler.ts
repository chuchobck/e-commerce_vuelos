import { z } from 'zod';
import { es } from '@/shared/i18n';
import { normalizeEmail } from '@/shared/lib/credentials';
import { isCountryCode } from '@/shared/lib/countries';
import { ageOn, parseDisplayDate, today } from '@/shared/lib/dates';
import { emailField, nameField, phoneField } from '@/shared/lib/schemas';
import { compactDocument } from '@/shared/lib/validators';
import { documentIssues, type DocumentType } from './documents';

const v = es.validation;
const t = es.travelerForm;

/**
 * Los datos de una persona que viaja, tal como se escriben en pantalla (todo texto). Son los mismos campos del pasajero de la
 * compra (`PassengerFormValue`) para que el perfil se vuelque en el pasajero 1 sin conversiones. `email` y `phone` son el
 * CONTACTO del viajero, no la cuenta (que es solo correo y contraseña).
 */
export interface TravelerValues {
  firstName: string;
  lastName: string;
  documentType: DocumentType;
  documentNumber: string;
  /** ISO 3166-1 alfa-2. */
  nationality: string;
  gender: '' | 'F' | 'M' | 'X';
  /** dd/mm/aaaa. */
  birthDate: string;
  /** dd/mm/aaaa; solo con pasaporte. */
  documentExpiryDate: string;
  /** Correo de contacto (por defecto, el de la cuenta). */
  email: string;
  /** 9 dígitos después de +593. */
  phone: string;
}

export type TravelerKey = keyof TravelerValues;

/** Los únicos campos que se guardan: nada más (nunca contraseñas ni tokens) entra al almacenamiento del perfil. */
export const TRAVELER_KEYS: readonly TravelerKey[] = ['firstName', 'lastName', 'documentType', 'documentNumber', 'nationality', 'gender', 'birthDate', 'documentExpiryDate', 'email', 'phone'];

export function emptyTraveler(contactEmail = ''): TravelerValues {
  return { firstName: '', lastName: '', documentType: 'NATIONAL_ID', documentNumber: '', nationality: 'EC', gender: '', birthDate: '', documentExpiryDate: '', email: contactEmail, phone: '' };
}

/** Edad mínima de quien compra y viaja como adulto (la misma que exige el backend para un adulto). */
export const ADULT_AGE = 18;

/**
 * Reglas del perfil: las mismas del pasajero adulto de la compra (nombres solo letras, cédula con módulo 10 o pasaporte,
 * celular de +593, correo del backend) medidas HOY: mayor de edad y, con pasaporte, vencimiento posterior a hoy. La
 * nacionalidad solo debe ser un país real: que se pueda comprar con ella es otra pregunta (`BOOKABLE_COUNTRIES`), así
 * quien no es ecuatoriano igual puede crear su cuenta y guardar sus datos.
 */
export function travelerSchema(reference: Date = today()) {
  return z
    .object({
      firstName: nameField,
      lastName: nameField,
      documentType: z.enum(['NATIONAL_ID', 'PASSPORT']),
      documentNumber: z.string().trim().min(1, v.required),
      nationality: z.string().trim().min(1, v.required).refine(isCountryCode, v.nationalityInvalid),
      gender: z.enum(['', 'F', 'M', 'X']).refine((g) => g !== '', v.requiredSelect),
      birthDate: z.string().trim().min(1, v.required),
      documentExpiryDate: z.string().trim(),
      email: emailField,
      phone: phoneField,
    })
    .superRefine((p, ctx) => {
      const issue = (path: TravelerKey, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      for (const found of documentIssues(p, { after: reference, message: t.passportExpired })) issue(found.path, found.message);
      if (p.birthDate) {
        const birth = parseDisplayDate(p.birthDate);
        if (!birth) issue('birthDate', v.dateInvalid);
        else if (birth > reference) issue('birthDate', v.birthFuture);
        else if (ageOn(birth, reference) < ADULT_AGE) issue('birthDate', t.birthAdult);
      }
    });
}

export interface TravelerEvaluation {
  /** Todos los campos están completos y correctos. */
  complete: boolean;
  /** Mensaje del primer problema de cada campo que tiene alguno. */
  messages: Partial<Record<TravelerKey, string>>;
  /** Campos con algo escrito y sin problemas (el vencimiento solo cuenta con pasaporte). */
  valid: TravelerKey[];
  /** Campos vacíos que hacen falta. */
  missing: TravelerKey[];
  /** Campos con algo escrito que hay que corregir. */
  invalid: TravelerKey[];
}

const isBlank = (value: string) => value.trim() === '';

/** Qué está bien, qué falta y qué hay que corregir en unos datos (completos o no). Sirve al perfil y al prellenado. */
export function evaluateTraveler(values: TravelerValues, reference: Date = today()): TravelerEvaluation {
  const parsed = travelerSchema(reference).safeParse(values);
  const messages: Partial<Record<TravelerKey, string>> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as TravelerKey;
      messages[key] ??= issue.message;
    }
  }
  const relevant = TRAVELER_KEYS.filter((key) => key !== 'documentExpiryDate' || values.documentType === 'PASSPORT');
  return {
    complete: parsed.success,
    messages,
    valid: relevant.filter((key) => !isBlank(values[key]) && !messages[key]),
    missing: relevant.filter((key) => messages[key] && isBlank(values[key])),
    invalid: relevant.filter((key) => messages[key] && !isBlank(values[key])),
  };
}

/** Los datos listos para guardar o enviar: sin espacios sobrantes, documento compactado, correo normalizado, vencimiento solo con pasaporte. */
export function normalizeTraveler(values: TravelerValues): TravelerValues {
  const collapse = (text: string) => text.trim().replace(/\s+/g, ' ');
  return {
    firstName: collapse(values.firstName),
    lastName: collapse(values.lastName),
    documentType: values.documentType,
    documentNumber: compactDocument(values.documentNumber),
    nationality: values.nationality.trim().toUpperCase(),
    gender: values.gender,
    birthDate: values.birthDate.trim(),
    documentExpiryDate: values.documentType === 'PASSPORT' ? values.documentExpiryDate.trim() : '',
    email: normalizeEmail(values.email),
    phone: values.phone.trim(),
  };
}
