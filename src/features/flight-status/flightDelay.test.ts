import { describe, expect, it } from 'vitest';
import type { FlightStatus } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { delayMinutes, flightBadge } from './flightDelay';

const t = es.aftersale.flight;

function status(code: FlightStatus['status'], estimated: string | null = null): Pick<FlightStatus, 'status' | 'departure'> {
  return { status: code, departure: { airport: 'UIO', terminal: null, scheduled: '2026-10-20T08:00:00-05:00', estimated, actual: null } };
}

describe('retraso del vuelo', () => {
  it('son los minutos entre la hora estimada y la programada; sin estimación o adelantado, cero', () => {
    expect(delayMinutes(status('DELAYED', '2026-10-20T08:45:00-05:00'))).toBe(45);
    expect(delayMinutes(status('SCHEDULED'))).toBe(0);
    expect(delayMinutes(status('SCHEDULED', '2026-10-20T07:50:00-05:00'))).toBe(0);
  });

  it('compara instantes, no textos: el mismo momento con otro desfase no es retraso', () => {
    expect(delayMinutes(status('SCHEDULED', '2026-10-20T13:00:00Z'))).toBe(0);
    expect(delayMinutes(status('SCHEDULED', '2026-10-20T13:30:00Z'))).toBe(30);
  });
});

describe('insignia del estado del vuelo', () => {
  it('cada estado tiene su texto y su tono, y el color nunca es la única señal', () => {
    expect(flightBadge(status('CANCELLED'))).toEqual({ label: t.cancelled, tone: 'error' });
    expect(flightBadge(status('DIVERTED'))).toEqual({ label: t.diverted, tone: 'warning' });
    expect(flightBadge(status('ARRIVED'))).toEqual({ label: t.arrived, tone: 'success' });
    expect(flightBadge(status('DEPARTED'))).toEqual({ label: t.departed, tone: 'info' });
    expect(flightBadge(status('BOARDING'))).toEqual({ label: t.boarding, tone: 'info' });
    expect(flightBadge(status('SCHEDULED'))).toEqual({ label: t.onTime, tone: 'success' });
  });

  it('retrasado dice cuántos minutos; si la API no da estimación lo dice sin inventar un número', () => {
    expect(flightBadge(status('DELAYED', '2026-10-20T08:45:00-05:00'))).toEqual({ label: fmt(t.delayed, { minutes: 45 }), tone: 'warning' });
    expect(flightBadge(status('DELAYED'))).toEqual({ label: t.delayedUnknown, tone: 'warning' });
  });

  it('programado con una estimación posterior también se avisa como retraso', () => {
    expect(flightBadge(status('SCHEDULED', '2026-10-20T08:20:00-05:00'))).toEqual({ label: fmt(t.delayed, { minutes: 20 }), tone: 'warning' });
  });
});
