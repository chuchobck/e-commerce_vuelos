import { addDays } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { lastFlightDate, toIsoDate, today } from './dates';

describe('ventana de fechas del buscador', () => {
  it('sin configuración: hoy + 89 días (la semilla genera 90 días)', () => {
    expect(toIsoDate(lastFlightDate(''))).toBe(toIsoDate(addDays(today(), 89)));
  });

  it('si la semilla termina antes, manda su último día', () => {
    const end = toIsoDate(addDays(today(), 30));
    expect(toIsoDate(lastFlightDate(end))).toBe(end);
  });

  it('una fecha configurada más lejana que hoy + 89 no amplía la ventana', () => {
    expect(toIsoDate(lastFlightDate(toIsoDate(addDays(today(), 200))))).toBe(toIsoDate(addDays(today(), 89)));
  });

  it('una fecha mal escrita se ignora', () => {
    expect(toIsoDate(lastFlightDate('31-12-2027'))).toBe(toIsoDate(addDays(today(), 89)));
  });
});
