import { addDays, subDays } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { es } from '@/shared/i18n';
import { toDisplayDate, today } from './dates';
import {
  birthDateMessage,
  cardExpiryField,
  cardNumberField,
  cedulaField,
  documentSchema,
  emailField,
  futureDateField,
  nameField,
  optionalFutureDateField,
  passwordField,
  phoneField,
} from './schemas';

const v = es.validation;

/** Primer mensaje de error de un safeParse fallido. */
function firstError(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? null : result.error!.issues[0].message;
}

describe('nameField', () => {
  it('acepta nombres reales y recorta espacios', () => {
    expect(nameField.parse('  María José ')).toBe('María José');
  });
  it('explica el error con mensajes específicos', () => {
    expect(firstError(nameField.safeParse(''))).toBe(v.required);
    expect(firstError(nameField.safeParse('A'))).toBe(v.nameLength);
    expect(firstError(nameField.safeParse('A'.repeat(41)))).toBe(v.nameLength);
    expect(firstError(nameField.safeParse('Juan 2'))).toBe(v.nameInvalid);
  });
});

describe('cedulaField', () => {
  it('acepta una cédula válida', () => {
    expect(cedulaField.safeParse('1710034065').success).toBe(true);
  });
  it('distingue longitud incorrecta de dígito verificador incorrecto', () => {
    expect(firstError(cedulaField.safeParse('171003406'))).toBe(v.cedulaLength);
    expect(firstError(cedulaField.safeParse('1710034066'))).toBe(v.cedulaInvalid);
  });
});

describe('documentSchema', () => {
  it('valida cédula con módulo 10 y pasaporte con patrón', () => {
    expect(documentSchema.safeParse({ documentType: 'CEDULA', documentNumber: '1710034065' }).success).toBe(true);
    expect(documentSchema.safeParse({ documentType: 'CEDULA', documentNumber: '1710034066' }).success).toBe(false);
    expect(documentSchema.safeParse({ documentType: 'PASSPORT', documentNumber: 'AB123456' }).success).toBe(true);
    expect(documentSchema.safeParse({ documentType: 'PASSPORT', documentNumber: 'AB1' }).success).toBe(false);
  });
});

describe('phoneField', () => {
  it('acepta 9 dígitos con 9 inicial', () => {
    expect(phoneField.safeParse('991234567').success).toBe(true);
  });
  it('rechaza con mensaje que indica el formato', () => {
    expect(firstError(phoneField.safeParse('0991234567'))).toBe(v.phoneInvalid);
    expect(firstError(phoneField.safeParse(''))).toBe(v.required);
  });
});

describe('emailField y passwordField', () => {
  it('valida correo', () => {
    expect(emailField.safeParse('ana@correo.ec').success).toBe(true);
    expect(firstError(emailField.safeParse('ana@'))).toBe(v.emailInvalid);
  });
  it('contraseña solo exige longitud (sin reglas de composición)', () => {
    expect(passwordField.safeParse('abcdefgh').success).toBe(true);
    expect(firstError(passwordField.safeParse('corta'))).toBe(v.passwordLength);
    expect(firstError(passwordField.safeParse('x'.repeat(65)))).toBe(v.passwordMax);
  });
});

describe('fechas futuras', () => {
  it('acepta hoy y fechas dentro de la ventana de venta', () => {
    expect(futureDateField.safeParse(toDisplayDate(today())).success).toBe(true);
    expect(futureDateField.safeParse(toDisplayDate(addDays(today(), 30))).success).toBe(true);
  });
  it('rechaza fechas pasadas, inexistentes y demasiado lejanas', () => {
    expect(firstError(futureDateField.safeParse(toDisplayDate(subDays(today(), 1))))).toBe(v.datePast);
    expect(firstError(futureDateField.safeParse('31/02/2027'))).toBe(v.dateInvalid);
    expect(firstError(futureDateField.safeParse('2027-01-01'))).toBe(v.dateInvalid);
    expect(firstError(futureDateField.safeParse(toDisplayDate(addDays(today(), 400))))).toBe(v.dateTooFar);
  });
  it('la fecha opcional acepta vacío', () => {
    expect(optionalFutureDateField.safeParse('').success).toBe(true);
    expect(optionalFutureDateField.safeParse(toDisplayDate(subDays(today(), 1))).success).toBe(false);
  });
});

describe('birthDateMessage', () => {
  const flight = new Date(2026, 11, 1);
  it('clasifica adulto, niño e infante según la edad en la fecha del vuelo', () => {
    expect(birthDateMessage('18/04/1990', 'ADT', flight)).toBeNull();
    expect(birthDateMessage('01/01/2020', 'ADT', flight)).toBe(v.birthAdult);
    expect(birthDateMessage('01/01/2020', 'CHD', flight)).toBeNull();
    expect(birthDateMessage('01/06/2025', 'CHD', flight)).toBe(v.birthChild);
    expect(birthDateMessage('01/06/2025', 'INF', flight)).toBeNull();
    expect(birthDateMessage('01/01/2020', 'INF', flight)).toBe(v.birthInfant);
  });
  it('rechaza fechas inválidas', () => {
    expect(birthDateMessage('32/01/2000', 'ADT', flight)).toBe(v.dateInvalid);
  });
});

describe('tarjeta', () => {
  it('número: longitud y Luhn con mensajes distintos', () => {
    expect(cardNumberField.safeParse('4111111111111111').success).toBe(true);
    expect(firstError(cardNumberField.safeParse('4111'))).toBe(v.cardLength);
    expect(firstError(cardNumberField.safeParse('4111111111111112'))).toBe(v.cardInvalid);
  });
  it('vencimiento: formato y fecha pasada', () => {
    expect(firstError(cardExpiryField.safeParse('13/30'))).toBe(v.expiryInvalid);
    expect(firstError(cardExpiryField.safeParse('01/20'))).toBe(v.expiryPast);
  });
});
