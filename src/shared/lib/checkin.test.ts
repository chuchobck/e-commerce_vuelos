import { describe, expect, it } from 'vitest';
import { checkInWindow, segmentCheckInStatus } from './checkin';

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

describe('estado del check-in de un vuelo', () => {
  const status = (now: string, hasPass = false) => segmentCheckInStatus(DEPARTURE, at(now), hasPass);

  it('antes de las 48 h no abre aún, aunque falte un segundo', () => {
    expect(status('2026-10-10T07:45:00-05:00')).toBe('no-abre-aun');
    expect(status('2026-10-12T07:44:59-05:00')).toBe('no-abre-aun');
  });

  it('justo a las 48 h ya está abierto, y sigue abierto a 60 min y 1 s', () => {
    expect(status('2026-10-12T07:45:00-05:00')).toBe('abierto');
    expect(status('2026-10-14T06:44:59-05:00')).toBe('abierto');
  });

  it('justo a los 60 min está cerrado, y sigue cerrado hasta la salida', () => {
    expect(status('2026-10-14T06:45:00-05:00')).toBe('cerrado');
    expect(status('2026-10-14T07:44:59-05:00')).toBe('cerrado');
  });

  it('a la hora exacta de salida, y después, el vuelo salió', () => {
    expect(status('2026-10-14T07:45:00-05:00')).toBe('salio');
    expect(status('2026-10-20T07:45:00-05:00')).toBe('salio');
  });

  it('con pase está hecho mientras no salga, también con la ventana ya cerrada', () => {
    expect(status('2026-10-13T07:45:00-05:00', true)).toBe('hecho');
    expect(status('2026-10-14T07:00:00-05:00', true)).toBe('hecho');
  });

  it('con pase y el vuelo ya salido, gana «salió»', () => {
    expect(status('2026-10-14T07:45:00-05:00', true)).toBe('salio');
  });

  it('compara instantes, no textos: la misma salida escrita en UTC da lo mismo', () => {
    expect(segmentCheckInStatus('2026-10-14T12:45:00Z', at('2026-10-12T07:45:00-05:00'), false)).toBe('abierto');
  });
});
