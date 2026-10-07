import { z } from 'zod';
import type { BookingPassenger, PassengerCount } from '@/shared/api';
import { es } from '@/shared/i18n';
import { displayToIso, isoToDisplay, parseDisplayDate } from '@/shared/lib/dates';
import { birthDateMessage, emailField, nameField, phoneField, type PassengerType } from '@/shared/lib/schemas';
import { compactDocument, isValidCedula, PASSPORT_PATTERN } from '@/shared/lib/validators';
import type { CheckoutSelection } from './selection';

const v = es.validation;

/**
 * Datos de pasajeros del paso 2 (formulario provisional de F4a; F4b lo reemplaza).
 * Mismas reglas que el DTO de reserva del backend (README, sección 6): la API decide igual, pero
 * así el usuario ve el error en su campo antes de pagar.
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
}

export interface PassengersFormValues {
  passengers: PassengerFormValue[];
  email: string;
  /** 9 dígitos después de +593. */
  phone: string;
}

/** Tipos en el orden del buscador: adultos, niños e infantes (la búsqueda no pide jóvenes). */
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

export function passengersSchema({ first, last }: { first: Date; last: Date }) {
  const passenger = z
    .object({
      type: z.enum(['ADULT', 'YOUTH', 'CHILD', 'INFANT']),
      firstName: nameField,
      lastName: nameField,
      documentType: z.enum(['NATIONAL_ID', 'PASSPORT']),
      documentNumber: z.string().trim().min(1, v.required),
      nationality: z
        .string()
        .trim()
        .min(1, v.required)
        .transform((s) => s.toUpperCase())
        .pipe(z.string().regex(/^[A-Z]{2}$/, v.nationalityInvalid)),
      documentExpiryDate: z.string().trim(),
      birthDate: z.string().trim().min(1, v.required),
      gender: z.enum(['', 'F', 'M', 'X']).refine((g) => g !== '', v.requiredSelect),
    })
    .superRefine((p, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
      const number = compactDocument(p.documentNumber);
      if (p.documentType === 'NATIONAL_ID' && p.nationality === 'EC') {
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
    });
  return z.object({ passengers: z.array(passenger), email: emailField, phone: phoneField });
}

/** Del formulario al pedido de la API: ids PAX1…, cada infante con un adulto distinto, fechas ISO. */
export function toBookingPassengers(values: PassengersFormValues): BookingPassenger[] {
  let adultIndex = 0;
  return values.passengers.map((p, i) => {
    const id = `PAX${i + 1}`;
    const infantAdult = p.type === 'INFANT' ? `PAX${++adultIndex}` : undefined;
    return {
      id,
      type: p.type,
      ...(infantAdult ? { associatedAdultId: infantAdult } : {}),
      firstName: p.firstName.trim(),
      lastName: p.lastName.trim(),
      documentType: p.documentType,
      documentNumber: compactDocument(p.documentNumber),
      nationality: p.nationality.trim().toUpperCase(),
      ...(p.documentType === 'PASSPORT' ? { documentExpiryDate: displayToIso(p.documentExpiryDate) } : {}),
      birthDate: displayToIso(p.birthDate),
      gender: p.gender as BookingPassenger['gender'],
      email: values.email.trim().toLowerCase(),
      phone: `+593${values.phone.trim()}`,
    };
  });
}

/** Valores iniciales: el borrador guardado si coincide con los pasajeros de la selección; si no, vacíos. */
export function initialPassengerValues(types: PassengerType[], draft: BookingPassenger[], accountEmail = ''): PassengersFormValues {
  const usable = draft.length === types.length && draft.every((d, i) => d.type === types[i]);
  return {
    passengers: types.map((type, i) => {
      const d = usable ? draft[i] : undefined;
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
      };
    }),
    email: (usable ? draft[0]?.email : undefined) ?? accountEmail,
    phone: (usable ? draft[0]?.phone.replace(/^\+593/, '') : undefined) ?? '',
  };
}

/** ¿El borrador guardado ya está completo y válido para esta selección? (al recargar en el paso 3). */
export function isDraftComplete(selection: CheckoutSelection, draft: BookingPassenger[]): boolean {
  const types = passengerTypes(selection.passengers);
  if (draft.length !== types.length) return false;
  return passengersSchema(tripDates(selection)).safeParse(initialPassengerValues(types, draft)).success;
}
