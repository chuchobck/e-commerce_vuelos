import { describe, expect, it } from 'vitest';
import type { BookingPassenger } from '@/shared/api';
import { es } from '@/shared/i18n';
import { initialPassengerValues, isDraftComplete, passengersSchema, passengerTypes, toBookingPassengers, type PassengersFormValues } from './passengers';
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

const person = (over: Partial<PassengersFormValues['passengers'][number]> = {}) => ({
  type: 'ADULT' as const,
  firstName: 'Ana',
  lastName: 'Pérez',
  documentType: 'NATIONAL_ID' as const,
  documentNumber: '1710034065',
  nationality: 'EC',
  documentExpiryDate: '',
  birthDate: '15/04/1990',
  gender: 'F' as const,
  ...over,
});
const values = (passengers: PassengersFormValues['passengers']): PassengersFormValues => ({ passengers, email: 'ana@example.test', phone: '991234567' });
const errorsOf = (r: ReturnType<ReturnType<typeof passengersSchema>['safeParse']>) => (r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));

describe('pasajeros del paso 2', () => {
  it('tipos en el orden del buscador', () => {
    expect(passengerTypes(SELECTION.passengers)).toEqual(['ADULT', 'ADULT', 'CHILD', 'INFANT']);
  });

  it('valida como el backend: cédula (módulo 10) solo para Ecuador, documento 5–20, pasaporte con vencimiento posterior al viaje', () => {
    const schema = passengersSchema(dates);
    expect(errorsOf(schema.safeParse(values([person()])))).toEqual([]);
    expect(errorsOf(schema.safeParse(values([person({ documentNumber: '1710034066' })])))).toEqual([`passengers.0.documentNumber: ${v.cedulaInvalid}`]);
    // Documento nacional de otro país: solo el formato general.
    expect(errorsOf(schema.safeParse(values([person({ nationality: 'co', documentNumber: '52.123.456' })])))).toEqual([]);
    expect(errorsOf(schema.safeParse(values([person({ documentType: 'PASSPORT', documentNumber: 'AB123456' })])))).toEqual([`passengers.0.documentExpiryDate: ${v.required}`]);
    expect(errorsOf(schema.safeParse(values([person({ documentType: 'PASSPORT', documentNumber: 'AB123456', documentExpiryDate: '10/12/2026' })])))).toEqual([
      `passengers.0.documentExpiryDate: ${v.passportExpiresBeforeTrip}`,
    ]);
  });

  it('la edad cuenta el día del primer vuelo y el infante debe seguir siendo infante al regreso', () => {
    const schema = passengersSchema(dates);
    expect(errorsOf(schema.safeParse(values([person({ birthDate: '01/01/2010' })])))).toEqual([`passengers.0.birthDate: ${v.birthAdult}`]);
    expect(errorsOf(schema.safeParse(values([person({ type: 'INFANT', birthDate: '10/12/2024' })])))).toEqual([`passengers.0.birthDate: ${v.birthInfant}`]);
  });

  it('al pedido: PAX1…, cada infante con un adulto distinto, documento compactado, fechas ISO y +593', () => {
    const list = toBookingPassengers({
      passengers: [person(), person({ firstName: 'Luis', documentNumber: '0926687856' }), person({ type: 'INFANT', firstName: 'Luz', documentType: 'PASSPORT', documentNumber: 'ab-123 456', documentExpiryDate: '01/01/2031', birthDate: '01/08/2025' })],
      email: ' Ana@Example.TEST ',
      phone: '991234567',
    });
    expect(list.map((p) => [p.id, p.type, p.associatedAdultId])).toEqual([
      ['PAX1', 'ADULT', undefined],
      ['PAX2', 'ADULT', undefined],
      ['PAX3', 'INFANT', 'PAX1'],
    ]);
    expect(list[2]).toMatchObject({ documentNumber: 'AB123456', documentExpiryDate: '2031-01-01', birthDate: '2025-08-01', email: 'ana@example.test', phone: '+593991234567' });
    expect(list[0]).not.toHaveProperty('documentExpiryDate');
  });

  it('el borrador se recupera solo si coincide con los pasajeros de la selección', () => {
    const draft: BookingPassenger[] = toBookingPassengers(values([person()]));
    expect(initialPassengerValues(['ADULT'], draft).passengers[0]).toMatchObject({ firstName: 'Ana', birthDate: '15/04/1990' });
    expect(initialPassengerValues(['ADULT', 'CHILD'], draft, 'cuenta@example.test')).toMatchObject({ email: 'cuenta@example.test', passengers: [{ firstName: '' }, { firstName: '' }] });
    expect(isDraftComplete({ ...SELECTION, passengers: { adults: 1, children: 0, infants: 0 } }, draft)).toBe(true);
    expect(isDraftComplete(SELECTION, draft)).toBe(false);
  });
});
