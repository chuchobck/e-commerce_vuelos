import { describe, expect, it } from 'vitest';
import type { BaggageOption } from '@/shared/api';
import { baggageTotal, lineKey, remainingFor, selectedLines, totalBags, type BaggageSelection } from './baggage';

function option(passengerId: string, itineraryId: string, cents: number | null, maxAllowed = 3, alreadyPurchased = 0): BaggageOption {
  return { passengerId, itineraryId, price: cents === null ? null : { cents, currency: 'USD' }, maxAllowed, alreadyPurchased };
}

const OPTIONS = [option('PAX1', 'it1', 3500), option('PAX1', 'it2', 3500), option('PAX2', 'it1', 2999, 2, 1)];

describe('totales de equipaje (centavos enteros)', () => {
  it('lo que se puede agregar es el máximo menos lo ya comprado, nunca negativo', () => {
    expect(remainingFor(OPTIONS[0])).toBe(3);
    expect(remainingFor(OPTIONS[2])).toBe(1);
    expect(remainingFor(option('P', 'i', 100, 2, 5))).toBe(0);
  });

  it('suma cantidad por precio de cada línea y el total de todas', () => {
    const selection: BaggageSelection = { [lineKey('PAX1', 'it1')]: 2, [lineKey('PAX1', 'it2')]: 1, [lineKey('PAX2', 'it1')]: 1 };
    const lines = selectedLines(OPTIONS, selection);
    expect(lines.map((l) => [l.option.passengerId, l.option.itineraryId, l.quantity, l.subtotal.cents])).toEqual([
      ['PAX1', 'it1', 2, 7000],
      ['PAX1', 'it2', 1, 3500],
      ['PAX2', 'it1', 1, 2999],
    ]);
    expect(baggageTotal(OPTIONS, selection)).toEqual({ cents: 13499, currency: 'USD' });
    expect(totalBags(OPTIONS, selection)).toBe(4);
  });

  it('sin flotantes: 0,1 + 0,2 no da 0,30000000000000004', () => {
    const options = [option('P1', 'i', 10, 5), option('P2', 'i', 20, 5)];
    expect(baggageTotal(options, { [lineKey('P1', 'i')]: 1, [lineKey('P2', 'i')]: 1 }).cents).toBe(30);
    expect(baggageTotal([option('P1', 'i', 3333, 5)], { [lineKey('P1', 'i')]: 3 }).cents).toBe(9999);
  });

  it('una cantidad que pasa el máximo se recorta; cero, negativa o una opción sin precio no cuentan', () => {
    const selection: BaggageSelection = { [lineKey('PAX1', 'it1')]: 99, [lineKey('PAX1', 'it2')]: 0, [lineKey('PAX2', 'it1')]: 5 };
    expect(selectedLines(OPTIONS, selection).map((l) => l.quantity)).toEqual([3, 1]);
    expect(totalBags([option('P', 'i', null)], { [lineKey('P', 'i')]: 2 })).toBe(0);
    expect(totalBags(OPTIONS, { [lineKey('PAX1', 'it1')]: -2 })).toBe(0);
  });

  it('sin selección el total es cero en la moneda de las opciones', () => {
    expect(baggageTotal(OPTIONS, {})).toEqual({ cents: 0, currency: 'USD' });
    expect(baggageTotal([], {})).toEqual({ cents: 0, currency: 'USD' });
  });
});
