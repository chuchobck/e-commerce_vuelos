import { addDays, subDays } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { es, fmt } from '@/shared/i18n';
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
    expect(nameField.safeParse('A').success).toBe(true);
    expect(firstError(nameField.safeParse('A'.repeat(61)))).toBe(v.nameLength);
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
    expect(documentSchema.safeParse({ documentType: 'NATIONAL_ID', documentNumber: '1710034065' }).success).toBe(true);
    expect(documentSchema.safeParse({ documentType: 'NATIONAL_ID', documentNumber: '1710034066' }).success).toBe(false);
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

describe('emailField y passwordField (idénticos al backend: credenciales.dto.ts y correo.decorator.ts)', () => {
  it('correo: normaliza como el backend (recorta y minúsculas)', () => {
    expect(emailField.parse('  Ana@Correo.EC ')).toBe('ana@correo.ec');
    expect(firstError(emailField.safeParse('ana@'))).toBe(v.emailInvalid);
    expect(firstError(emailField.safeParse('   '))).toBe(v.required);
  });
  it('correo: rechaza lo que el backend rechaza', () => {
    expect(firstError(emailField.safeParse('ana@correo'))).toBe(v.emailInvalid); // require_tld
    expect(firstError(emailField.safeParse('ana@[127.0.0.1]'))).toBe(v.emailInvalid); // allow_ip_domain: false
    expect(firstError(emailField.safeParse('Ana <ana@correo.ec>'))).toBe(v.emailInvalid); // sin display name
    expect(firstError(emailField.safeParse(`an${String.fromCodePoint(0x200b)}a@correo.ec`))).toBe(v.emailInvalid); // invisible
    expect(firstError(emailField.safeParse(`${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.ec`))).toBe(v.emailLength);
  });
  it('contraseña: 12 a 128 caracteres y nada más (sin reglas de composición)', () => {
    expect(passwordField.safeParse('una frase larga').success).toBe(true);
    expect(passwordField.safeParse('x'.repeat(12)).success).toBe(true);
    expect(passwordField.safeParse('x'.repeat(128)).success).toBe(true);
    expect(firstError(passwordField.safeParse('x'.repeat(11)))).toBe(v.passwordLength);
    expect(firstError(passwordField.safeParse('x'.repeat(129)))).toBe(v.passwordMax);
    expect(firstError(passwordField.safeParse(''))).toBe(v.required);
  });
  it('contraseña: no recorta espacios y mide tras NFKC, como el backend', () => {
    // 11 letras + 1 espacio al borde = 12: vale (el backend no recorta).
    expect(passwordField.parse('abcdefghijk ')).toBe('abcdefghijk ');
    // "ﬁ" (U+FB01) pasa a "fi" en NFKC: 6 × "ﬁ" = 12 caracteres para el backend.
    expect(passwordField.safeParse('ﬁ'.repeat(6)).success).toBe(true);
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
    // Fuera de la ventana de salidas de la API (hoy + 89 días): el mensaje dice hasta cuándo hay vuelos.
    expect(firstError(futureDateField.safeParse(toDisplayDate(addDays(today(), 90))))).toBe(
      fmt(v.dateTooFar, { date: toDisplayDate(addDays(today(), 89)) }),
    );
    expect(firstError(futureDateField.safeParse(toDisplayDate(addDays(today(), 89))))).toBeNull();
  });
  it('la fecha opcional acepta vacío', () => {
    expect(optionalFutureDateField.safeParse('').success).toBe(true);
    expect(optionalFutureDateField.safeParse(toDisplayDate(subDays(today(), 1))).success).toBe(false);
  });
});

describe('birthDateMessage', () => {
  const flight = new Date(2026, 11, 1);
  it('clasifica como el backend: adulto ≥ 18, joven 12–17, niño 2–11, infante < 2', () => {
    expect(birthDateMessage('18/04/1990', 'ADULT', flight)).toBeNull();
    expect(birthDateMessage('01/01/2010', 'ADULT', flight)).toBe(v.birthAdult);
    expect(birthDateMessage('01/01/2010', 'YOUTH', flight)).toBeNull();
    expect(birthDateMessage('01/01/2020', 'CHILD', flight)).toBeNull();
    expect(birthDateMessage('01/06/2025', 'CHILD', flight)).toBe(v.birthChild);
    expect(birthDateMessage('01/06/2025', 'INFANT', flight)).toBeNull();
    expect(birthDateMessage('01/01/2020', 'INFANT', flight)).toBe(v.birthInfant);
  });
  it('un infante que cumple 2 antes del regreso necesita asiento', () => {
    expect(birthDateMessage('15/12/2024', 'INFANT', flight, new Date(2026, 11, 20))).toBe(v.birthInfant);
  });
  it('rechaza fechas inválidas', () => {
    expect(birthDateMessage('32/01/2000', 'ADULT', flight)).toBe(v.dateInvalid);
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
