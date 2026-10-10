import { describe, expect, it } from 'vitest';
import { amountDue, cheaperThanCurrent, needsPayment, newDateProblem, priceDirection, suggestedDate } from './dateChange';

const price = (cents: number) => ({ total: { cents, currency: 'USD' } });
const itinerary = (departureTime: string) => ({ segments: [{ departureTime }] as never });
// Fecha fija en hora local del equipo de prueba (los helpers de fechas trabajan con días calendario locales).
const NOW = new Date(2026, 9, 9);

describe('precio de un cambio de fecha', () => {
  it('se paga o no cuesta: la API nunca devuelve un total negativo (max(0, tarifa + impuestos) + cargo)', () => {
    expect(priceDirection(price(2500))).toBe('pay');
    expect(priceDirection(price(0))).toBe('free');
    // Defensa: aunque llegara un negativo, no se promete ningún reembolso.
    expect(priceDirection(price(-1200))).toBe('free');
  });

  it('avisa cuando el nuevo vuelo cuesta menos (esa diferencia no se devuelve)', () => {
    const money = (cents: number) => ({ cents, currency: 'USD' });
    expect(cheaperThanCurrent({ fare: money(-1500), taxes: money(200) })).toBe(true);
    expect(cheaperThanCurrent({ fare: money(1500), taxes: money(-200) })).toBe(false);
    expect(cheaperThanCurrent({ fare: money(0), taxes: money(0) })).toBe(false);
  });

  it('solo hay que pagar (y pedir un pago) cuando el total es positivo', () => {
    expect(needsPayment(price(1))).toBe(true);
    expect(needsPayment(price(0))).toBe(false);
    expect(needsPayment(price(-500))).toBe(false);
    expect(amountDue(price(2500))).toEqual({ cents: 2500, currency: 'USD' });
    expect(amountDue(price(-500))).toEqual({ cents: 0, currency: 'USD' });
  });
});

describe('nueva fecha escrita', () => {
  const current = itinerary('2026-10-20T08:00:00-05:00');

  it('una fecha válida de hoy en adelante pasa, convertida a yyyy-MM-dd', () => {
    expect(newDateProblem('21/10/2026', current, NOW)).toEqual({ date: '2026-10-21' });
    expect(newDateProblem('09/10/2026', current, NOW)).toEqual({ date: '2026-10-09' });
  });

  it('rechaza lo que no es una fecha, una fecha pasada y el mismo día del vuelo actual', () => {
    expect(newDateProblem('31/02/2026', current, NOW)).toEqual({ problem: 'invalid' });
    expect(newDateProblem('', current, NOW)).toEqual({ problem: 'invalid' });
    expect(newDateProblem('08/10/2026', current, NOW)).toEqual({ problem: 'past' });
    expect(newDateProblem('20/10/2026', current, NOW)).toEqual({ problem: 'same' });
  });

  it('sugiere el día siguiente al vuelo actual, o mañana si ese vuelo ya pasó', () => {
    expect(suggestedDate(current, NOW)).toEqual(new Date(2026, 9, 21));
    expect(suggestedDate(itinerary('2026-09-01T08:00:00-05:00'), NOW)).toEqual(new Date(2026, 9, 10));
  });
});
