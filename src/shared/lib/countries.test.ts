import { describe, expect, it } from 'vitest';
import { BOOKABLE_COUNTRIES, countries, isBookableCountry, isCountryCode } from './countries';

describe('países', () => {
  it('Ecuador primero y el resto en orden alfabético, en español', () => {
    const list = countries();
    expect(list[0]).toEqual({ code: 'EC', name: 'Ecuador' });
    expect(list.find((c) => c.code === 'ES')?.name).toBe('España');
    expect(list.find((c) => c.code === 'US')?.name).toBe('Estados Unidos');
    const rest = list.slice(1).map((c) => c.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('códigos únicos de 2 letras y sin nombres sin traducir', () => {
    const list = countries();
    expect(new Set(list.map((c) => c.code)).size).toBe(list.length);
    expect(list.every((c) => /^[A-Z]{2}$/.test(c.code) && c.name !== c.code)).toBe(true);
    expect(isCountryCode('CO')).toBe(true);
    expect(isCountryCode('XX')).toBe(false);
  });

  it('solo se reserva con los países que la API conoce (hoy, Ecuador)', () => {
    expect(BOOKABLE_COUNTRIES).toEqual(['EC']);
    expect(isBookableCountry('EC')).toBe(true);
    expect(isBookableCountry('CO')).toBe(false);
    expect(BOOKABLE_COUNTRIES.every(isCountryCode)).toBe(true);
  });
});
