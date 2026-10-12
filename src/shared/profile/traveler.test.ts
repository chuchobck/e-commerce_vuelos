import { describe, expect, it } from 'vitest';
import { es } from '@/shared/i18n';
import { ADULT_AGE, emptyTraveler, evaluateTraveler, normalizeTraveler, TRAVELER_KEYS, travelerSchema, type TravelerValues } from './traveler';

const v = es.validation;
const t = es.travelerForm;
const NOW = new Date(2026, 9, 12); // 12/10/2026

const ANA: TravelerValues = {
  firstName: 'Ana María',
  lastName: 'Pérez Loor',
  documentType: 'NATIONAL_ID',
  documentNumber: '1710034065',
  nationality: 'EC',
  gender: 'F',
  birthDate: '15/03/1990',
  documentExpiryDate: '',
  email: 'ana@example.test',
  phone: '991234567',
};
const traveler = (over: Partial<TravelerValues> = {}): TravelerValues => ({ ...ANA, ...over });
const messages = (values: TravelerValues) => evaluateTraveler(values, NOW).messages;

describe('reglas del perfil de viajero (las del pasajero adulto, medidas hoy)', () => {
  it('unos datos completos y correctos son válidos', () => {
    expect(evaluateTraveler(ANA, NOW)).toMatchObject({ complete: true, messages: {}, missing: [], invalid: [] });
  });

  it('un perfil vacío falta en todo, con el documento nacional y Ecuador por defecto', () => {
    const e = evaluateTraveler(emptyTraveler(), NOW);
    expect(e.complete).toBe(false);
    expect(e.missing.sort()).toEqual(['birthDate', 'email', 'firstName', 'gender', 'lastName', 'documentNumber', 'phone'].sort());
    expect(e.valid).toEqual(['documentType', 'nationality']);
  });

  it('nombres: solo letras (con tildes y ñ), sin números', () => {
    expect(messages(traveler({ firstName: 'Ana2' })).firstName).toBe(v.nameInvalid);
    expect(messages(traveler({ lastName: 'A'.repeat(61) })).lastName).toBe(v.nameLength);
    expect(messages(traveler({ firstName: 'Ñusta Núñez' })).firstName).toBeUndefined();
  });

  it('cédula con módulo 10 y pasaporte con vencimiento posterior a hoy', () => {
    expect(messages(traveler({ documentNumber: '1710034066' })).documentNumber).toBe(v.cedulaInvalid);
    const passport = traveler({ documentType: 'PASSPORT', documentNumber: 'AB12345', documentExpiryDate: '13/10/2026' });
    expect(messages(passport)).toEqual({});
    expect(messages({ ...passport, documentExpiryDate: '12/10/2026' }).documentExpiryDate).toBe(t.passportExpired);
    expect(messages({ ...passport, documentExpiryDate: '' }).documentExpiryDate).toBe(v.required);
  });

  it('con documento nacional el vencimiento no cuenta aunque haya algo escrito', () => {
    const e = evaluateTraveler(traveler({ documentExpiryDate: '01/01/2000' }), NOW);
    expect(e.complete).toBe(true);
    expect(e.valid).not.toContain('documentExpiryDate');
  });

  it('fecha de nacimiento: real, no futura y de una persona de 18 años o más', () => {
    expect(messages(traveler({ birthDate: '31/02/1990' })).birthDate).toBe(v.dateInvalid);
    expect(messages(traveler({ birthDate: '13/10/2026' })).birthDate).toBe(v.birthFuture);
    expect(messages(traveler({ birthDate: '13/10/2008' })).birthDate).toBe(t.birthAdult); // cumple 18 mañana
    expect(messages(traveler({ birthDate: '12/10/2008' })).birthDate).toBeUndefined(); // hoy cumple 18
    expect(ADULT_AGE).toBe(18);
  });

  it('celular de +593 con 9 dígitos y correo como el del backend', () => {
    expect(messages(traveler({ phone: '0991234567' })).phone).toBe(v.phoneInvalid);
    expect(messages(traveler({ phone: '891234567' })).phone).toBe(v.phoneInvalid);
    expect(messages(traveler({ email: 'ana@' })).email).toBe(v.emailInvalid);
  });

  it('la nacionalidad solo debe ser un país real: no hace falta poder comprar con ella para guardar los datos', () => {
    expect(messages(traveler({ nationality: 'PE', documentType: 'PASSPORT', documentNumber: 'AB12345', documentExpiryDate: '01/01/2030' }))).toEqual({});
    expect(messages(traveler({ nationality: 'ZZ' })).nationality).toBe(v.nationalityInvalid);
    expect(messages(traveler({ nationality: '' })).nationality).toBe(v.required);
  });

  it('distingue lo que falta de lo que hay que corregir', () => {
    const e = evaluateTraveler(traveler({ lastName: '', birthDate: '99/99/9999', phone: '' }), NOW);
    expect(e.missing.sort()).toEqual(['lastName', 'phone']);
    expect(e.invalid).toEqual(['birthDate']);
    expect(e.valid).toContain('firstName');
    expect(e.valid).not.toContain('birthDate');
  });
});

describe('normalizar antes de guardar', () => {
  it('quita espacios sobrantes, compacta el documento y normaliza el correo', () => {
    const n = normalizeTraveler(traveler({ firstName: '  Ana   María ', documentType: 'PASSPORT', documentNumber: 'ab-123 45', documentExpiryDate: ' 01/01/2030 ', email: '  ANA@Example.Test ', nationality: ' ec ' }));
    expect(n).toMatchObject({ firstName: 'Ana María', documentNumber: 'AB12345', documentExpiryDate: '01/01/2030', email: 'ana@example.test', nationality: 'EC' });
  });

  it('borra el vencimiento si el documento no es pasaporte', () => {
    expect(normalizeTraveler(traveler({ documentExpiryDate: '01/01/2030' })).documentExpiryDate).toBe('');
  });

  it('el resultado de normalizar unos datos válidos sigue siendo válido', () => {
    expect(travelerSchema(NOW).safeParse(normalizeTraveler(ANA)).success).toBe(true);
  });

  it('la lista de campos guardables es cerrada y no tiene nada de la cuenta', () => {
    expect([...TRAVELER_KEYS].sort()).toEqual(Object.keys(ANA).sort());
    expect(TRAVELER_KEYS.some((key) => /pass|token|secret/i.test(key))).toBe(false);
  });
});
