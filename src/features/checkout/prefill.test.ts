import { describe, expect, it } from 'vitest';
import type { TravelerValues } from '@/shared/profile';
import { initialPassengerValues, passengerTypes } from './passengers';
import { prefillFromProfile } from './prefill';

const NOW = new Date(2026, 9, 12);
const ANA: TravelerValues = { firstName: 'Ana', lastName: 'Pérez', documentType: 'NATIONAL_ID', documentNumber: '1710034065', nationality: 'EC', gender: 'F', birthDate: '15/03/1990', documentExpiryDate: '', email: 'contacto@example.test', phone: '991234567' };
const profile = (over: Partial<TravelerValues> = {}): TravelerValues => ({ ...ANA, ...over });
const base = (adults = 1, children = 0, infants = 0) => initialPassengerValues(passengerTypes({ adults, children, infants }), [], 'cuenta@example.test');

describe('prellenado del pasajero 1 con el perfil de viajero', () => {
  it('llena el pasajero 1 (adulto) con los datos del perfil', () => {
    const r = prefillFromProfile(base(), profile(), NOW);
    expect(r.applied).toBe(true);
    expect(r.review).toEqual([]);
    expect(r.values.passengers[0]).toMatchObject({ type: 'ADULT', firstName: 'Ana', lastName: 'Pérez', documentType: 'NATIONAL_ID', documentNumber: '1710034065', nationality: 'EC', gender: 'F', birthDate: '15/03/1990', email: 'contacto@example.test', phone: '991234567' });
  });

  it('el correo de contacto del perfil reemplaza al de la cuenta; si no sirve, queda el de la cuenta', () => {
    expect(prefillFromProfile(base(), profile({ email: 'ana@' }), NOW).values.passengers[0].email).toBe('cuenta@example.test');
  });

  it('NUNCA llena a los demás: ni otros adultos, ni niños, ni infantes', () => {
    const start = base(2, 1, 1);
    const r = prefillFromProfile(start, profile(), NOW);
    expect(r.values.passengers[0].firstName).toBe('Ana');
    expect(r.values.passengers.slice(1)).toEqual(start.passengers.slice(1));
    for (const other of r.values.passengers.slice(1)) {
      expect(other.firstName).toBe('');
      expect(other.documentNumber).toBe('');
      expect(other.birthDate).toBe('');
    }
    expect(r.values.passengers.map((p) => p.type)).toEqual(['ADULT', 'ADULT', 'CHILD', 'INFANT']);
  });

  it('si el primer pasajero no es adulto, no llena nada', () => {
    const start = base(1, 1, 0);
    const swapped = { ...start, passengers: [{ ...start.passengers[1] }, { ...start.passengers[0] }] };
    expect(prefillFromProfile(swapped, profile(), NOW)).toEqual({ values: swapped, applied: false, review: [] });
  });

  it('sin perfil no cambia nada', () => {
    const start = base();
    expect(prefillFromProfile(start, null, NOW)).toEqual({ values: start, applied: false, review: [] });
    expect(prefillFromProfile(start, undefined, NOW).applied).toBe(false);
  });

  it('perfil incompleto: llena lo válido y marca el resto (lo vacío y lo que está mal)', () => {
    const r = prefillFromProfile(base(), profile({ phone: '', birthDate: '01/01/2020', lastName: '' }), NOW);
    expect(r.applied).toBe(true);
    const first = r.values.passengers[0];
    expect(first).toMatchObject({ firstName: 'Ana', documentNumber: '1710034065', gender: 'F', email: 'contacto@example.test' });
    expect(first).toMatchObject({ phone: '', birthDate: '', lastName: '' });
    expect(r.review.sort()).toEqual(['birthDate', 'lastName', 'phone']);
  });

  it('perfil inválido por completo: no llena nada y lo marca todo', () => {
    const r = prefillFromProfile(base(), profile({ firstName: '123', lastName: '', documentNumber: '1', birthDate: 'x', gender: '', phone: '55', email: '' }), NOW);
    expect(r.applied).toBe(false);
    expect(r.values.passengers[0].firstName).toBe('');
    expect(r.review.sort()).toEqual(['birthDate', 'documentNumber', 'email', 'firstName', 'gender', 'lastName', 'phone'].sort());
  });

  it('si el borrador ya trae datos del pasajero 1, no se pisa nada: manda lo que la persona escribió', () => {
    const start = base();
    start.passengers[0] = { ...start.passengers[0], firstName: 'Otra', phone: '991111111' };
    const r = prefillFromProfile(start, profile(), NOW);
    expect(r).toEqual({ values: start, applied: false, review: [] });
  });

  it('un borrador en blanco (guardado vacío al abrir el paso) sí se llena', () => {
    expect(prefillFromProfile(base(), profile(), NOW).applied).toBe(true);
  });

  it('pasaporte con vencimiento vigente: llena el documento y su vencimiento', () => {
    const r = prefillFromProfile(base(), profile({ documentType: 'PASSPORT', documentNumber: 'AB12345', documentExpiryDate: '01/01/2030' }), NOW);
    expect(r.values.passengers[0]).toMatchObject({ documentType: 'PASSPORT', documentNumber: 'AB12345', documentExpiryDate: '01/01/2030' });
    expect(r.review).toEqual([]);
  });

  it('pasaporte vencido: no se llena el vencimiento y se marca', () => {
    const r = prefillFromProfile(base(), profile({ documentType: 'PASSPORT', documentNumber: 'AB12345', documentExpiryDate: '01/01/2020' }), NOW);
    expect(r.values.passengers[0].documentExpiryDate).toBe('');
    expect(r.review).toEqual(['documentExpiryDate']);
  });

  it('nacionalidad con la que aún no se puede comprar: se llenan nombre y contacto, no lo que depende del país, y se marca', () => {
    const r = prefillFromProfile(base(), profile({ nationality: 'PE', documentType: 'PASSPORT', documentNumber: 'AB12345', documentExpiryDate: '01/01/2030' }), NOW);
    const first = r.values.passengers[0];
    expect(first).toMatchObject({ firstName: 'Ana', phone: '991234567', nationality: 'EC', documentType: 'NATIONAL_ID', documentNumber: '', documentExpiryDate: '' });
    expect(r.review.sort()).toEqual(['documentExpiryDate', 'documentNumber', 'nationality']);
  });

  it('no modifica los valores que recibe', () => {
    const start = base();
    const snapshot = JSON.stringify(start);
    prefillFromProfile(start, profile(), NOW);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});
