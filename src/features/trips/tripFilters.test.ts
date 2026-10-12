import { describe, expect, it } from 'vitest';
import type { BookingStatus, BookingSummary } from '@/shared/api';
import { classifyTrip, countTrips, tripsFor } from './tripFilters';

const TODAY = '2026-10-09';

function summary(code: string, status: BookingStatus | null, departureDate: string): BookingSummary {
  return { id: `id-${code}`, code, status, origin: 'UIO', destination: 'GYE', departureDate, total: { cents: 1000, currency: 'USD' } };
}

const LIST = [
  summary('A', 'CONFIRMED', '2026-11-01'),
  summary('B', 'CONFIRMED', '2026-10-12'),
  summary('C', 'CONFIRMED', '2026-09-30'),
  summary('D', 'CANCELLED', '2026-10-20'),
  summary('E', 'PENDING_PAYMENT', '2026-10-25'),
  summary('F', 'CANCELLED', '2026-08-01'),
  summary('G', 'FAILED', '2026-10-15'),
  summary('H', 'CONFIRMED', '2026-10-09'),
];

describe('filtros de Mis viajes', () => {
  it('clasifica por estado y fecha de salida: hoy todavía es un viaje próximo', () => {
    expect(classifyTrip(summary('x', 'CONFIRMED', TODAY), TODAY)).toBe('upcoming');
    expect(classifyTrip(summary('x', 'CONFIRMED', '2026-10-08'), TODAY)).toBe('past');
    expect(classifyTrip(summary('x', 'CANCELLED', '2026-12-01'), TODAY)).toBe('cancelled');
    expect(classifyTrip(summary('x', 'FAILED', '2026-12-01'), TODAY)).toBe('cancelled');
  });

  it('un estado que el frontend no conoce (null) no se pierde: cae en próximos o pasados según la fecha', () => {
    expect(classifyTrip(summary('x', null, '2026-12-01'), TODAY)).toBe('upcoming');
    expect(classifyTrip(summary('x', null, '2026-01-01'), TODAY)).toBe('past');
  });

  it('próximos: el más cercano primero; pasados y cancelados: el más reciente primero', () => {
    expect(tripsFor(LIST, 'upcoming', TODAY).map((t) => t.code)).toEqual(['H', 'B', 'E', 'A']);
    expect(tripsFor(LIST, 'past', TODAY).map((t) => t.code)).toEqual(['C']);
    expect(tripsFor(LIST, 'cancelled', TODAY).map((t) => t.code)).toEqual(['D', 'G', 'F']);
  });

  it('el orden es estable con la misma fecha y no modifica la lista de entrada', () => {
    const same = [summary('1', 'CONFIRMED', '2026-11-01'), summary('2', 'CONFIRMED', '2026-11-01'), summary('3', 'CONFIRMED', '2026-11-01')];
    const copy = [...same];
    expect(tripsFor(same, 'upcoming', TODAY).map((t) => t.code)).toEqual(['1', '2', '3']);
    expect(same).toEqual(copy);
  });

  it('cuenta cada pestaña y la suma da el total de la lista', () => {
    const counts = countTrips(LIST, TODAY);
    expect(counts).toEqual({ upcoming: 4, past: 1, cancelled: 3 });
    expect(counts.upcoming + counts.past + counts.cancelled).toBe(LIST.length);
  });
});
