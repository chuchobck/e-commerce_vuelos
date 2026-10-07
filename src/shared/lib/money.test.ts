import { describe, expect, it } from 'vitest';
import { formatMoney } from './format';
import { addMoney, minMoney, multiplyMoney, parseMoney, sumMoney, toDecimalString } from './money';

const usd = (cents: number) => ({ cents, currency: 'USD' });

describe('dinero en centavos enteros', () => {
  it('lee el texto de la API sin flotantes', () => {
    expect(parseMoney('94.38', 'USD')).toEqual(usd(9438));
    expect(parseMoney('15', 'USD')).toEqual(usd(1500));
    expect(parseMoney('0.5', 'USD')).toEqual(usd(50));
    expect(parseMoney('3009.86', 'USD')).toEqual(usd(300986));
  });

  it('rechaza montos inválidos', () => {
    expect(() => parseMoney('94,38', 'USD')).toThrow();
    expect(() => parseMoney('1.234', 'USD')).toThrow();
    expect(() => parseMoney('', 'USD')).toThrow();
  });

  it('suma sin errores de coma flotante (0,1 + 0,2 = 0,30)', () => {
    expect(addMoney(parseMoney('0.10', 'USD'), parseMoney('0.20', 'USD'))).toEqual(usd(30));
    expect(sumMoney([usd(42042), usd(42042), usd(31533)])).toEqual(usd(115617));
  });

  it('no mezcla monedas ni multiplica por fracciones', () => {
    expect(() => addMoney(usd(1), { cents: 1, currency: 'EUR' })).toThrow();
    expect(() => multiplyMoney(usd(100), 1.5)).toThrow();
    expect(multiplyMoney(usd(42042), 2)).toEqual(usd(84084));
  });

  it('mínimo y vuelta a texto del contrato', () => {
    expect(minMoney([usd(500), usd(120), usd(900)])).toEqual(usd(120));
    expect(minMoney([])).toBeUndefined();
    expect(toDecimalString(usd(300986))).toBe('3009.86');
    expect(toDecimalString(usd(5))).toBe('0.05');
  });

  it('formato único de presentación (es-EC, USD)', () => {
    const text = formatMoney(usd(9438));
    expect(text).toMatch(/94,38/);
    expect(text).toMatch(/\$/);
  });
});
