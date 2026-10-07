import { z } from 'zod';
import type { BookingPassenger, PassengerCount } from '@/shared/api';
import { es } from '@/shared/i18n';
import { isBookableCountry } from '@/shared/lib/countries';
import { displayToIso, isoToDisplay, parseDisplayDate } from '@/shared/lib/dates';
import { birthDateMessage, emailField, nameField, phoneField, type PassengerType } from '@/shared/lib/schemas';
import { compactDocument, isValidCedula, onlyDigits, PASSPORT_PATTERN } from '@/shared/lib/validators';
import type { CheckoutSelection } from './selection';

const v = es.validation;

/**
 * Datos de pasajeros del paso 2. Mismas reglas que el DTO de reserva del backend (README, sección 6):
 * la API decide igual, pero así el usuario ve el error en su campo antes de pagar.
 */
export interface PassengerFormValue {
  type: PassengerType;
  firstName: string;
  lastName: string;
  documentType: 'NATIONAL_ID' | 'PASSPORT';
  documentNumber: string;
  /** ISO 3166-1 alfa-2. */
  nationality: string;
  /** dd/mm/aaaa; solo con pasaporte. */
  documentExpiryDate: string;
  /** dd/mm/aaaa. */
  birthDate: string;
  gender: '' | 'F' | 'M' | 'X';
  /** Solo infantes: posición (en la lista de pasajeros) del adulto que lo lleva, como texto. */
  adultIndex: string;
  email: string;
  /** 9 dígitos después de +593. */
  phone: string;
}

export interface PassengersFormValues {
  passengers: PassengerFormValue[];
  /** Un solo contacto (el del primer pasajero) para todos. */
  sameContact: boolean;
}

/** Tipos en el orden de la búsqueda: adultos, niños e infantes (el buscador no pide jóvenes). */
export function passengerTypes(count: PassengerCount): PassengerType[] {
  return [...Array<PassengerType>(count.adults).fill('ADULT'), ...Array<PassengerType>(count.children).fill('CHILD'), ...Array<PassengerType>(count.infants).fill('INFANT')];
}

/** Fecha local (del aeropuerto) del primer y del último vuelo: la edad y el pasaporte se miden ahí. */
export function tripDates(selection: Pick<CheckoutSelection, 'outbound' | 'inbound'>): { first: Date; last: Date } {
  const day = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const lastLeg = selection.inbound ?? selection.outbound;
  return { first: day(selection.outbound.itinerary.segments[0].departureTime), last: day(lastLeg.itinerary.segments[lastLeg.itinerary.segments.length - 1].departureTime) };
}

/** ¿La cédula aplica? Solo con documento nacional de Ecuador (el backend valida el módulo 10 solo ahí). */
export const isEcuadorianId = (p: Pick<PassengerFormValue, 'documentType' | 'nationality'>) => p.documentType === 'NATIONAL_ID' && p.nationality === 'EC';

/** Lo que se acepta teclear o pegar en el número de documento (bloquea el resto). */
export function sanitizeDocument(p: Pick<PassengerFormValue, 'documentType' | 'nationality'>, raw: string): string {
  return isEcuadorianId(p) ? onlyDigits(raw).slice(0, 10) : compactDocument(raw).replace(/[^A-Z0-9]/g, '').slice(0, 20);
}

export function passengersSchema({ first, last }: { first: Date; last: Date }) {
  const passenger = z
    .object({
      type: z.enum(['ADULT', 'YOUTH', 'CHILD', 'INFANT']),
      firstName: nameField,
      lastName: nameField,
      documentType: z.enum(['NATIONAL_ID', 'PASSPORT']),
      documentNumber: z.string().trim().min(1, v.required),
      nationality: z.string().trim().min(1, v.required),
      documentExpiryDate: z.string().trim(),
      birthDate: z.string().trim().min(1, v.required),
      gender: z.enum(['', 'F', 'M', 'X']).refine((g) => g !== '', v.requiredSelect),
      adultIndex: z.string(),
      email: emailField,
      phone: phoneField,
    })
    .superRefine((p, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      if (!isBookableCountry(p.nationality)) issue('nationality', v.nationalityUnavailable);
      const number = compactDocument(p.documentNumber);
      if (isEcuadorianId(p)) {
        if (number.length !== 10) issue('documentNumber', v.cedulaLength);
        else if (!isValidCedula(number)) issue('documentNumber', v.cedulaInvalid);
      } else if (number && !PASSPORT_PATTERN.test(number)) {
        issue('documentNumber', v.passportInvalid);
      }
      if (p.documentType === 'PASSPORT') {
        const expiry = parseDisplayDate(p.documentExpiryDate);
        if (!p.documentExpiryDate) issue('documentExpiryDate', v.required);
        else if (!expiry) issue('documentExpiryDate', v.dateInvalid);
        else if (expiry <= last) issue('documentExpiryDate', v.passportExpiresBeforeTrip);
      }
      const birth = p.birthDate ? birthDateMessage(p.birthDate, p.type, first, last) : null;
      if (birth) issue('birthDate', birth);
      if (p.type === 'INFANT' && p.adultIndex === '') issue('adultIndex', v.requiredSelect);
    });
  return z
    .object({ passengers: z.array(passenger), sameContact: z.boolean() })
    .superRefine((value, ctx) => {
      // Cada adulto lleva a lo sumo un infante (lo exige la API).
      const seen = new Map<string, number>();
      value.passengers.forEach((p, i) => {
        if (p.type !== 'INFANT' || p.adultIndex === '') return;
        if (seen.has(p.adultIndex)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['passengers', i, 'adultIndex'], message: v.oneInfantPerAdult });
        seen.set(p.adultIndex, i);
      });
    });
}

/** Con "mismo contacto para todos", el contacto del primer pasajero va en todos (antes de validar y de enviar). */
export function withSharedContact(values: PassengersFormValues): PassengersFormValues {
  const [first] = values.passengers;
  if (!values.sameContact || !first) return values;
  return { ...values, passengers: values.passengers.map((p) => ({ ...p, email: first.email, phone: first.phone })) };
}

/** Del formulario al pedido de la API: ids PAX1…, cada infante con el adulto elegido, fechas ISO. */
export function toBookingPassengers(input: PassengersFormValues): BookingPassenger[] {
  const values = withSharedContact(input);
  return values.passengers.map((p, i) => ({
    id: `PAX${i + 1}`,
    type: p.type,
    ...(p.type === 'INFANT' && p.adultIndex !== '' ? { associatedAdultId: `PAX${Number(p.adultIndex) + 1}` } : {}),
    firstName: p.firstName.trim(),
    lastName: p.lastName.trim(),
    documentType: p.documentType,
    documentNumber: compactDocument(p.documentNumber),
    nationality: p.nationality.trim().toUpperCase(),
    ...(p.documentType === 'PASSPORT' ? { documentExpiryDate: displayToIso(p.documentExpiryDate) } : {}),
    birthDate: displayToIso(p.birthDate),
    gender: p.gender as BookingPassenger['gender'],
    email: p.email.trim().toLowerCase(),
    phone: `+593${p.phone.trim()}`,
  }));
}

/**
 * Valores iniciales: el borrador guardado si coincide con los pasajeros de la selección; si no,
 * vacíos, con el correo de la cuenta en el contacto del primer pasajero (no se pide dos veces).
 */
export function initialPassengerValues(types: PassengerType[], draft: BookingPassenger[], accountEmail = ''): PassengersFormValues {
  const usable = draft.length === types.length && draft.every((d, i) => d.type === types[i]);
  let infants = 0;
  const passengers = types.map((type, i): PassengerFormValue => {
    const d = usable ? draft[i] : undefined;
    const defaultAdult = type === 'INFANT' ? String(infants++) : '';
    const saved = d?.associatedAdultId ? String(Number(d.associatedAdultId.replace(/^PAX/, '')) - 1) : '';
    return {
      type,
      firstName: d?.firstName ?? '',
      lastName: d?.lastName ?? '',
      documentType: d?.documentType ?? 'NATIONAL_ID',
      documentNumber: d?.documentNumber ?? '',
      nationality: d?.nationality ?? 'EC',
      documentExpiryDate: isoToDisplay(d?.documentExpiryDate),
      birthDate: isoToDisplay(d?.birthDate),
      gender: d?.gender ?? '',
      adultIndex: type === 'INFANT' ? saved || defaultAdult : '',
      email: d?.email ?? (i === 0 ? accountEmail : ''),
      phone: d?.phone.replace(/^\+593/, '') ?? '',
    };
  });
  const sameContact = passengers.every((p) => p.email === passengers[0].email && p.phone === passengers[0].phone);
  return { passengers, sameContact };
}

/** ¿El borrador guardado ya está completo y válido para esta selección? (al recargar en el paso 3). */
export function isDraftComplete(selection: CheckoutSelection, draft: BookingPassenger[]): boolean {
  const types = passengerTypes(selection.passengers);
  if (draft.length !== types.length) return false;
  return passengersSchema(tripDates(selection)).safeParse(initialPassengerValues(types, draft)).success;
}
