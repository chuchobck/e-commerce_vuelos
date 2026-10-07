import { describe, expect, it } from 'vitest';
import { maskDateInput } from './dates';
import {
  BOOKING_CODE_PATTERN,
  FLIGHT_NUMBER_PATTERN,
  NAME_PATTERN,
  PASSPORT_PATTERN,
  PHONE_EC_PATTERN,
  isFutureExpiry,
  isValidCedula,
  isValidExpiryFormat,
  isValidLuhn,
  onlyDigits,
} from './validators';

describe('isValidCedula (módulo 10)', () => {
  it('acepta cédulas válidas de varias provincias', () => {
    expect(isValidCedula('1710034065')).toBe(true); // Pichincha
    expect(isValidCedula('0926687856')).toBe(true); // Guayas
    expect(isValidCedula('0102030405')).toBe(false); // verificador incorrecto a propósito
  });
  it('calcula el dígito verificador cuando el producto pasa de 9', () => {
    // 0 1 0 2 0 3 0 4 0 → suma 10 → verificador 0
    expect(isValidCedula('0102030400')).toBe(true);
  });
  it('rechaza dígito verificador incorrecto', () => {
    expect(isValidCedula('1710034066')).toBe(false);
  });
  it('rechaza provincia inexistente y acepta 30 (ecuatorianos en el exterior)', () => {
    expect(isValidCedula('9910034065')).toBe(false);
    expect(isValidCedula('2510034065')).toBe(false);
    expect(isValidCedula('3000000004')).toBe(true);
    expect(isValidCedula('3000000000')).toBe(false);
  });
  it('rechaza tercer dígito ≥ 6 (no es persona natural)', () => {
    expect(isValidCedula('1760000000')).toBe(false);
  });
  it('rechaza longitudes y caracteres inválidos', () => {
    expect(isValidCedula('171003406')).toBe(false);
    expect(isValidCedula('17100340655')).toBe(false);
    expect(isValidCedula('17100340AB')).toBe(false);
    expect(isValidCedula('')).toBe(false);
  });
});

describe('isValidLuhn', () => {
  it('acepta tarjetas de prueba de distintas marcas y longitudes', () => {
    expect(isValidLuhn('4111111111111111')).toBe(true); // Visa
    expect(isValidLuhn('5555555555554444')).toBe(true); // Mastercard
    expect(isValidLuhn('378282246310005')).toBe(true); // Amex (15)
    expect(isValidLuhn('4222222222222')).toBe(true); // 13 dígitos
  });
  it('rechaza números alterados', () => {
    expect(isValidLuhn('4111111111111112')).toBe(false);
    expect(isValidLuhn('5555555555554445')).toBe(false);
  });
  it('rechaza longitudes fuera de 13–19 y caracteres no numéricos', () => {
    expect(isValidLuhn('411111111111')).toBe(false);
    expect(isValidLuhn('41111111111111111111')).toBe(false);
    expect(isValidLuhn('4111 1111 1111 1111')).toBe(false);
  });
});

describe('teléfono celular de Ecuador', () => {
  it('acepta 9 dígitos que empiezan con 9', () => {
    expect(PHONE_EC_PATTERN.test('991234567')).toBe(true);
    expect(PHONE_EC_PATTERN.test('987654321')).toBe(true);
  });
  it('rechaza fijos, prefijos y longitudes incorrectas', () => {
    expect(PHONE_EC_PATTERN.test('0991234567')).toBe(false);
    expect(PHONE_EC_PATTERN.test('22345678')).toBe(false);
    expect(PHONE_EC_PATTERN.test('99123456')).toBe(false);
    expect(PHONE_EC_PATTERN.test('+593991234567')).toBe(false);
  });
});

describe('nombres', () => {
  it('acepta tildes, ñ, diéresis, espacios, apóstrofe y guion', () => {
    for (const name of ['María José', 'Núñez', 'Güemes', "D'Alessandro", 'Pérez-Andrade']) {
      expect(NAME_PATTERN.test(name)).toBe(true);
    }
  });
  it('rechaza números y símbolos', () => {
    for (const name of ['Juan2', 'Ana@', 'Luis_', 'José.']) {
      expect(NAME_PATTERN.test(name)).toBe(false);
    }
  });
});

describe('otros patrones', () => {
  it('pasaporte alfanumérico de 6 a 12', () => {
    expect(PASSPORT_PATTERN.test('A1234567')).toBe(true);
    expect(PASSPORT_PATTERN.test('A123')).toBe(false);
    expect(PASSPORT_PATTERN.test('A1234 567')).toBe(false);
  });
  it('código de reserva y número de vuelo', () => {
    expect(BOOKING_CODE_PATTERN.test('QD7K2M')).toBe(true);
    expect(BOOKING_CODE_PATTERN.test('QD7K2')).toBe(false);
    expect(FLIGHT_NUMBER_PATTERN.test('QD100')).toBe(true);
    expect(FLIGHT_NUMBER_PATTERN.test('qd1234')).toBe(true);
    expect(FLIGHT_NUMBER_PATTERN.test('LA100')).toBe(false);
  });
});

describe('vencimiento de tarjeta', () => {
  const now = new Date(2026, 9, 6);
  it('acepta el mes actual y futuros', () => {
    expect(isFutureExpiry('10/26', now)).toBe(true);
    expect(isFutureExpiry('01/30', now)).toBe(true);
  });
  it('rechaza vencidas y meses inválidos', () => {
    expect(isFutureExpiry('09/26', now)).toBe(false);
    expect(isFutureExpiry('13/30', now)).toBe(false);
    expect(isValidExpiryFormat('00/28')).toBe(false);
    expect(isValidExpiryFormat('1/28')).toBe(false);
  });
});

describe('utilidades de entrada', () => {
  it('onlyDigits limpia texto pegado', () => {
    expect(onlyDigits('17a1-003 4065')).toBe('1710034065');
  });
  it('maskDateInput inserta barras y no acepta más de 8 dígitos', () => {
    expect(maskDateInput('15102026')).toBe('15/10/2026');
    expect(maskDateInput('151')).toBe('15/1');
    expect(maskDateInput('15/10/20269')).toBe('15/10/2026');
  });
});
