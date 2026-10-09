import type { DateChangePrice, Itinerary, Money } from '@/shared/api';
import { addDays } from 'date-fns';
import { parseDisplayDate, parseIsoDate, toIsoDate, today } from '@/shared/lib/dates';

/** Qué le pasa al bolsillo con un cambio de fecha: positivo se paga, negativo se devuelve, cero no cuesta. */
export type PriceDirection = 'pay' | 'refund' | 'free';

export function priceDirection(price: Pick<DateChangePrice, 'total'>): PriceDirection {
  return price.total.cents > 0 ? 'pay' : price.total.cents < 0 ? 'refund' : 'free';
}

/** Lo que hay que pagar ahora (0 si es reembolso o gratis): solo con algo que pagar se pide un pago. */
export function amountDue(price: Pick<DateChangePrice, 'total'>): Money {
  return { cents: Math.max(0, price.total.cents), currency: price.total.currency };
}

export function needsPayment(price: Pick<DateChangePrice, 'total'>): boolean {
  return price.total.cents > 0;
}

/** El valor absoluto, para escribir "Te devolvemos $X" sin el signo menos. */
export function absMoney(money: Money): Money {
  return { cents: Math.abs(money.cents), currency: money.currency };
}

export type NewDateProblem = 'invalid' | 'past' | 'same';

/**
 * Valida la nueva fecha escrita ("dd/mm/aaaa") contra el vuelo actual: debe ser una fecha real, de hoy en adelante y
 * distinta del día del vuelo que se cambia. La ventana de venta la decide la API (sin vuelos responde una lista vacía).
 */
export function newDateProblem(value: string, itinerary: Pick<Itinerary, 'segments'>, now: Date = today()): { date: string } | { problem: NewDateProblem } {
  const date = parseDisplayDate(value);
  if (!date) return { problem: 'invalid' };
  if (date < now) return { problem: 'past' };
  const current = parseIsoDate(itinerary.segments[0].departureTime.slice(0, 10));
  if (current && toIsoDate(current) === toIsoDate(date)) return { problem: 'same' };
  return { date: toIsoDate(date) };
}

/** Fecha sugerida por defecto: el día siguiente al vuelo actual (o mañana si ya pasó), para no empezar en blanco. */
export function suggestedDate(itinerary: Pick<Itinerary, 'segments'>, now: Date = today()): Date {
  const current = parseIsoDate(itinerary.segments[0].departureTime.slice(0, 10)) ?? now;
  const next = addDays(current, 1);
  return next < now ? addDays(now, 1) : next;
}
