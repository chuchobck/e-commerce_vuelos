import { describe, expect, it } from 'vitest';
import type { CheckInResult, KioskFlight, KioskSession } from '@/shared/api';
import { ApiError } from '@/shared/api';
import { es } from '@/shared/i18n';
import { applyCheckIn, flightOffer } from './flightCheckIn';
import { identificationIssues, normalizePnr } from './identification';
import { isKioskSessionExpired, kioskErrorMessage } from './kioskMessages';

const flight = (window: KioskFlight['checkIn']['window'], statuses: ('CHECKED_IN' | 'NOT_CHECKED_IN' | 'FAILED')[]): KioskFlight => ({
  segmentId: 's1',
  flightNumber: 'LA1400',
  origin: 'UIO',
  destination: 'GYE',
  departureAt: '2026-11-12T06:30:00-05:00',
  arrivalAt: '2026-11-12T07:25:00-05:00',
  departureTerminal: null,
  status: 'SCHEDULED',
  checkIn: { window, opensAt: null, closesAt: null },
  passengers: statuses.map((checkInStatus, i) => ({ passengerId: `p${i}`, seat: null, checkInStatus })),
});

describe('flightOffer', () => {
  it('registrado gana sobre la ventana; si no, manda la ventana', () => {
    expect(flightOffer(flight('CLOSED', ['CHECKED_IN']))).toBe('registered');
    expect(flightOffer(flight('OPEN', ['CHECKED_IN', 'NOT_CHECKED_IN']))).toBe('open');
    expect(flightOffer(flight('OPEN', ['CHECKED_IN', 'FAILED']))).toBe('open');
    expect(flightOffer(flight('NOT_YET_OPEN', ['NOT_CHECKED_IN']))).toBe('not-yet');
    expect(flightOffer(flight('CLOSED', ['NOT_CHECKED_IN']))).toBe('closed');
    expect(flightOffer(flight('OPEN', []))).toBe('open');
  });
});

describe('applyCheckIn', () => {
  it('refleja el resultado por pasajero y vuelo sin tocar lo demás', () => {
    const session: KioskSession = { token: 't', expiresAt: 'x', booking: { id: 'b', status: 'CONFIRMED', passengers: [], flights: [flight('OPEN', ['NOT_CHECKED_IN', 'NOT_CHECKED_IN'])] } };
    const result: CheckInResult = { bookingId: 'b', status: 'IN_PROGRESS', passengers: [{ passengerId: 'p0', status: 'CHECKED_IN', segments: [{ segmentId: 's1', seat: '9A', status: 'CHECKED_IN' }] }] };
    const next = applyCheckIn(session, result).booking.flights[0].passengers;
    expect(next[0]).toEqual({ passengerId: 'p0', seat: '9A', checkInStatus: 'CHECKED_IN' });
    expect(next[1].checkInStatus).toBe('NOT_CHECKED_IN');
  });
});

describe('identificación', () => {
  it('el código pasa a mayúsculas, sin símbolos y con 6 como máximo', () => {
    expect(normalizePnr('ab-c 12x9')).toBe('ABC12X');
  });
  it('dice qué falta y cuándo está listo', () => {
    expect(identificationIssues({ pnr: '', lastName: '' }).missing).toHaveLength(2);
    expect(identificationIssues({ pnr: 'ABC', lastName: 'Pérez' })).toMatchObject({ ready: false, pnrError: es.kiosk.identify.pnrInvalid });
    expect(identificationIssues({ pnr: 'ABC123', lastName: '  ' }).ready).toBe(false);
    expect(identificationIssues({ pnr: 'ABC123', lastName: 'Pérez' }).ready).toBe(true);
  });
});

describe('mensajes de error del kiosko', () => {
  const e = (status: number, code?: string) => new ApiError({ status, code: code as never, detail: 'secreto' });
  it('mapea cada caso a su texto y nunca al detalle', () => {
    expect(kioskErrorMessage(e(404))).toBe(es.kiosk.errors.notFound);
    expect(kioskErrorMessage(e(401, 'KIOSK_SESSION_INVALID'))).toBe(es.kiosk.errors.sessionExpired);
    expect(kioskErrorMessage(e(409, 'CHECK_IN_NOT_AVAILABLE'))).toBe(es.kiosk.errors.checkInNotAvailable);
    expect(kioskErrorMessage(e(429))).toBe(es.kiosk.errors.rateLimited);
    expect(kioskErrorMessage(e(503))).not.toContain('secreto');
    expect(kioskErrorMessage(new Error('x'))).toBe(es.errors.unknown);
  });
  it('solo el 401 con ese código es sesión vencida', () => {
    expect(isKioskSessionExpired(e(401, 'KIOSK_SESSION_INVALID'))).toBe(true);
    expect(isKioskSessionExpired(e(401))).toBe(false);
    expect(isKioskSessionExpired(e(404, 'KIOSK_SESSION_INVALID'))).toBe(false);
  });
});
