import { describe, expect, it } from 'vitest';
import type { BookingPassenger } from '@/shared/api';
import { es } from '@/shared/i18n';
import { apiFieldToForm } from './passengerFields';
import {
  initialPassengerValues,
  isDraftComplete,
  passengersSchema,
  passengerTypes,
  sanitizeDocument,
  toBookingPassengers,
  type PassengerFormValue,
  type PassengersFormValues,
} from './passengers';
import type { CheckoutSelection } from './selection';

const v = es.validation;
const leg = (departure: string) => ({ itinerary: { id: 'i', segments: [{ departureTime: departure }], durationMinutes: 50, stops: 0, fares: [] }, fare: {} }) as unknown as CheckoutSelection['outbound'];
const SELECTION = {
  offerId: 'o',
  outbound: leg('2026-12-01T06:00:00-05:00'),
  inbound: leg('2026-12-20T18:00:00-05:00'),
  passengers: { adults: 2, children: 1, infants: 1 },
  searchQuery: '',
} as CheckoutSelection;
const dates = { first: new Date(2026, 11, 1), last: new Date(2026, 11, 20) };

const person = (over: Partial<PassengerFormValue> = {}): PassengerFormValue => ({
  type: 'ADULT',
  firstName: 'Ana',
  lastName: 'Pérez',
  documentType: 'NATIONAL_ID',
  documentNumber: '1710034065',
  nationality: 'EC',
  documentExpiryDate: '',
  birthDate: '15/04/1990',
  gender: 'F',
  adultIndex: '',
  email: 'ana@example.test',
  phone: '991234567',
  ...over,
});
const form = (passengers: PassengerFormValue[], sameContact = false): PassengersFormValues => ({ passengers, sameContact, seats: {} });
const errorsOf = (r: ReturnType<ReturnType<typeof passengersSchema>['safeParse']>) => (r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));

describe('pasajeros del paso 2', () => {
  it('tipos en el orden del buscador', () => {
    expect(passengerTypes(SELECTION.passengers)).toEqual(['ADULT', 'ADULT', 'CHILD', 'INFANT']);
  });

  it('cédula (módulo 10) solo con documento nacional de Ecuador; pasaporte con vencimiento posterior al viaje', () => {
    const schema = passengersSchema(dates);
    expect(errorsOf(schema.safeParse(form([person()])))).toEqual([]);
    expect(errorsOf(schema.safeParse(form([person({ documentNumber: '1710034066' })])))).toEqual([`passengers.0.documentNumber: ${v.cedulaInvalid}`]);
    expect(errorsOf(schema.safeParse(form([person({ documentNumber: '171003406' })])))).toEqual([`passengers.0.documentNumber: ${v.cedulaLength}`]);
    expect(errorsOf(schema.safeParse(form([person({ documentType: 'PASSPORT', documentNumber: 'AB123456' })])))).toEqual([`passengers.0.documentExpiryDate: ${v.required}`]);
    expect(errorsOf(schema.safeParse(form([person({ documentType: 'PASSPORT', documentNumber: 'AB123456', documentExpiryDate: '10/12/2026' })])))).toEqual([
      `passengers.0.documentExpiryDate: ${v.passportExpiresBeforeTrip}`,
    ]);
    expect(errorsOf(schema.safeParse(form([person({ documentType: 'PASSPORT', documentNumber: 'AB123456', documentExpiryDate: '01/01/2031' })])))).toEqual([]);
  });

  it('la API solo conoce Ecuador: otra nacionalidad se explica en su campo', () => {
    expect(errorsOf(passengersSchema(dates).safeParse(form([person({ nationality: 'CO' })])))).toEqual([`passengers.0.nationality: ${v.nationalityUnavailable}`]);
  });

  it('la edad cuenta el día del primer vuelo: adulto ≥ 18, joven 12–17, niño 2–11, infante < 2 en todo el viaje', () => {
    const schema = passengersSchema(dates);
    expect(errorsOf(schema.safeParse(form([person({ birthDate: '01/01/2010' })])))).toEqual([`passengers.0.birthDate: ${v.birthAdult}`]);
    expect(errorsOf(schema.safeParse(form([person({ type: 'YOUTH', birthDate: '01/01/2010' })])))).toEqual([]);
    expect(errorsOf(schema.safeParse(form([person({ type: 'CHILD', birthDate: '01/01/2020' })])))).toEqual([]);
    expect(errorsOf(schema.safeParse(form([person({ type: 'CHILD', birthDate: '01/06/2025' })])))).toEqual([`passengers.0.birthDate: ${v.birthChild}`]);
    const infant = (birthDate: string) => form([person(), person({ type: 'INFANT', adultIndex: '0', birthDate })]);
    expect(errorsOf(schema.safeParse(infant('01/08/2025')))).toEqual([]);
    expect(errorsOf(schema.safeParse(infant('10/12/2024')))).toEqual([`passengers.1.birthDate: ${v.birthInfant}`]);
  });

  it('el infante exige un adulto y cada adulto lleva a lo sumo uno', () => {
    const schema = passengersSchema(dates);
    const baby = (adultIndex: string) => person({ type: 'INFANT', adultIndex, birthDate: '01/08/2025' });
    expect(errorsOf(schema.safeParse(form([person(), baby('')])))).toEqual([`passengers.1.adultIndex: ${v.requiredSelect}`]);
    expect(errorsOf(schema.safeParse(form([person(), baby('0'), baby('0')])))).toEqual([`passengers.2.adultIndex: ${v.oneInfantPerAdult}`]);
    expect(errorsOf(schema.safeParse(form([person(), person(), baby('0'), baby('1')])))).toEqual([]);
  });

  it('correo y celular de +593 con 9 dígitos; nombres sin números', () => {
    const schema = passengersSchema(dates);
    expect(errorsOf(schema.safeParse(form([person({ phone: '0991234567' })])))).toEqual([`passengers.0.phone: ${v.phoneInvalid}`]);
    expect(errorsOf(schema.safeParse(form([person({ email: 'ana@' })])))).toEqual([`passengers.0.email: ${v.emailInvalid}`]);
    expect(errorsOf(schema.safeParse(form([person({ firstName: 'Ana2' })])))).toEqual([`passengers.0.firstName: ${v.nameInvalid}`]);
    expect(errorsOf(schema.safeParse(form([person({ firstName: 'A'.repeat(61) })])))).toEqual([`passengers.0.firstName: ${v.nameLength}`]);
  });

  it('solo-dígitos y límites al teclear o pegar el documento', () => {
    expect(sanitizeDocument({ documentType: 'NATIONAL_ID', nationality: 'EC' }, '1710-034 065abc99')).toBe('1710034065');
    expect(sanitizeDocument({ documentType: 'PASSPORT', nationality: 'EC' }, 'ab-123 456!')).toBe('AB123456');
    expect(sanitizeDocument({ documentType: 'PASSPORT', nationality: 'EC' }, 'x'.repeat(30))).toHaveLength(20);
  });

  it('al pedido: PAX1…, infante con el adulto elegido, documento compactado, fechas ISO y +593', () => {
    const list = toBookingPassengers(
      form([person(), person({ firstName: 'Luis', documentNumber: '0926687856' }), person({ type: 'INFANT', firstName: 'Luz', adultIndex: '1', documentType: 'PASSPORT', documentNumber: 'ab-123 456', documentExpiryDate: '01/01/2031', birthDate: '01/08/2025', email: ' Luz@Example.TEST ' })]),
    );
    expect(list.map((p) => [p.id, p.type, p.associatedAdultId])).toEqual([
      ['PAX1', 'ADULT', undefined],
      ['PAX2', 'ADULT', undefined],
      ['PAX3', 'INFANT', 'PAX2'],
    ]);
    expect(list[2]).toMatchObject({ documentNumber: 'AB123456', documentExpiryDate: '2031-01-01', birthDate: '2025-08-01', email: 'luz@example.test', phone: '+593991234567' });
    expect(list[0]).not.toHaveProperty('documentExpiryDate');
  });

  it('"mismo contacto para todos": el contacto del primer pasajero va en todos', () => {
    const list = toBookingPassengers(form([person({ email: 'jefe@example.test', phone: '987654321' }), person({ email: '', phone: '' })], true));
    expect(list.map((p) => [p.email, p.phone])).toEqual([
      ['jefe@example.test', '+593987654321'],
      ['jefe@example.test', '+593987654321'],
    ]);
  });

  it('precarga: el correo de la cuenta va en el primer pasajero y no se pide dos veces', () => {
    const values = initialPassengerValues(['ADULT', 'ADULT', 'INFANT'], [], 'cuenta@example.test');
    expect(values.passengers.map((p) => p.email)).toEqual(['cuenta@example.test', '', '']);
    expect(values.passengers[2]).toMatchObject({ type: 'INFANT', adultIndex: '0' });
    expect(values.sameContact).toBe(false);
    expect(initialPassengerValues(['ADULT'], [], 'cuenta@example.test').sameContact).toBe(true);
  });

  it('el borrador se recupera solo si coincide con los pasajeros de la selección', () => {
    const draft: BookingPassenger[] = toBookingPassengers(form([person()]));
    expect(initialPassengerValues(['ADULT'], draft).passengers[0]).toMatchObject({ firstName: 'Ana', birthDate: '15/04/1990' });
    expect(initialPassengerValues(['ADULT', 'CHILD'], draft, 'cuenta@example.test')).toMatchObject({ passengers: [{ firstName: '', email: 'cuenta@example.test' }, { firstName: '' }] });
    expect(isDraftComplete({ ...SELECTION, passengers: { adults: 1, children: 0, infants: 0 } }, draft)).toBe(true);
    expect(isDraftComplete(SELECTION, draft)).toBe(false);
  });

  it('un campo rechazado por la API se marca en su campo del formulario', () => {
    expect(apiFieldToForm('passengers[1].birthDate')).toEqual({ index: 1, name: 'birthDate' });
    expect(apiFieldToForm('passengers[0].contact.phone')).toEqual({ index: 0, name: 'phone' });
    expect(apiFieldToForm('passengers[0].contact.email')).toEqual({ index: 0, name: 'email' });
    expect(apiFieldToForm('passengers[2].associatedAdultId')).toEqual({ index: 2, name: 'adultIndex' });
    expect(apiFieldToForm('holdId')).toBeNull();
  });
});
