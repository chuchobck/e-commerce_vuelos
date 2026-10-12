import { describe, expect, it } from 'vitest';
import { es } from '@/shared/i18n';
import { documentIssues, isEcuadorianId, sanitizeDocument } from './documents';

const v = es.validation;
const AFTER = new Date(2026, 11, 1);
const EXPIRY = { after: AFTER, message: 'vence antes' };
const person = (over: Partial<Parameters<typeof documentIssues>[0]> = {}) => ({ documentType: 'NATIONAL_ID' as const, nationality: 'EC', documentNumber: '1710034065', documentExpiryDate: '', ...over });

describe('reglas del documento (las usan el perfil y el paso de pasajeros)', () => {
  it('solo-dígitos y límites al teclear o pegar el documento', () => {
    expect(sanitizeDocument({ documentType: 'NATIONAL_ID', nationality: 'EC' }, '1710-034 065abc99')).toBe('1710034065');
    expect(sanitizeDocument({ documentType: 'PASSPORT', nationality: 'EC' }, 'ab-123 456!')).toBe('AB123456');
    expect(sanitizeDocument({ documentType: 'PASSPORT', nationality: 'EC' }, 'x'.repeat(30))).toHaveLength(20);
  });

  it('la cédula solo aplica a ecuatorianos con documento nacional', () => {
    expect(isEcuadorianId({ documentType: 'NATIONAL_ID', nationality: 'EC' })).toBe(true);
    expect(isEcuadorianId({ documentType: 'PASSPORT', nationality: 'EC' })).toBe(false);
    expect(isEcuadorianId({ documentType: 'NATIONAL_ID', nationality: 'PE' })).toBe(false);
  });

  it('cédula: 10 dígitos y módulo 10', () => {
    expect(documentIssues(person(), EXPIRY)).toEqual([]);
    expect(documentIssues(person({ documentNumber: '171003406' }), EXPIRY)).toEqual([{ path: 'documentNumber', message: v.cedulaLength }]);
    expect(documentIssues(person({ documentNumber: '1710034066' }), EXPIRY)).toEqual([{ path: 'documentNumber', message: v.cedulaInvalid }]);
  });

  it('pasaporte: de 5 a 20 letras o números y vencimiento posterior al límite que se da', () => {
    const passport = (over = {}) => person({ documentType: 'PASSPORT', documentNumber: 'AB12345', documentExpiryDate: '02/12/2026', ...over });
    expect(documentIssues(passport(), EXPIRY)).toEqual([]);
    expect(documentIssues(passport({ documentNumber: 'AB1' }), EXPIRY)).toEqual([{ path: 'documentNumber', message: v.passportInvalid }]);
    expect(documentIssues(passport({ documentExpiryDate: '' }), EXPIRY)).toEqual([{ path: 'documentExpiryDate', message: v.required }]);
    expect(documentIssues(passport({ documentExpiryDate: '31/02/2030' }), EXPIRY)).toEqual([{ path: 'documentExpiryDate', message: v.dateInvalid }]);
    // El día límite no sirve: tiene que vencer DESPUÉS.
    expect(documentIssues(passport({ documentExpiryDate: '01/12/2026' }), EXPIRY)).toEqual([{ path: 'documentExpiryDate', message: 'vence antes' }]);
  });

  it('con documento nacional no se pide vencimiento', () => {
    expect(documentIssues(person({ documentExpiryDate: '' }), EXPIRY)).toEqual([]);
  });
});
