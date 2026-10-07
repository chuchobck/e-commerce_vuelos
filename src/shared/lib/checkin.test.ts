import { describe, expect, it } from 'vitest';
import { checkInWindow } from './checkin';

// Salida: miércoles 14 de octubre de 2026, 07:45 en Quito (12:45 UTC).
const DEPARTURE = '2026-10-14T07:45:00-05:00';
const at = (iso: string) => new Date(iso);

describe('ventana de check-in (48 h antes hasta 60 min antes)', () => {
  it('no abre antes de las 48 h y dice cuándo abre en hora del aeropuerto', () => {
    const w = checkInWindow(DEPARTURE, at('2026-10-12T07:44:59-05:00'));
    expect(w.status).toBe('not-open');
    if (w.status === 'not-open') {
      expect(w.opensAtLocal).toBe('2026-10-12T07:45:00-05:00');
      expect(w.opensAt.toISOString()).toBe('2026-10-12T12:45:00.000Z');
    }
  });

  it('abre justo a las 48 h', () => {
    expect(checkInWindow(DEPARTURE, at('2026-10-12T07:45:00-05:00')).status).toBe('open');
  });

  it('sigue abierta a 61 minutos de la salida', () => {
    expect(checkInWindow(DEPARTURE, at('2026-10-14T06:44:00-05:00')).status).toBe('open');
  });

  it('cierra a 60 minutos de la salida', () => {
    expect(checkInWindow(DEPARTURE, at('2026-10-14T06:45:00-05:00')).status).toBe('closed');
    expect(checkInWindow(DEPARTURE, at('2026-10-14T09:00:00-05:00')).status).toBe('closed');
  });

  it('respeta el horario de Galápagos (UTC−6) y el cambio de mes', () => {
    const w = checkInWindow('2026-11-01T10:00:00-06:00', at('2026-10-30T09:00:00-06:00'));
    expect(w.status).toBe('not-open');
    if (w.status === 'not-open') expect(w.opensAtLocal).toBe('2026-10-30T10:00:00-06:00');
  });
});
