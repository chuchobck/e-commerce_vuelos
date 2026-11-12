import { describe, expect, it, vi } from 'vitest';
import { createHttpClient } from './http/client';
import type { DeparturesResponseDto, KioskLookupResponseDto } from './kioskContract';
import { mapDepartures, mapKioskLookup } from './mapping';
import { mockDepartures, mockKioskBoardingPasses, mockKioskCheckIn, mockKioskLookup, MOCK_KIOSK_LAST_NAME, MOCK_KIOSK_PNRS, resetMockKiosk } from './mock/kiosk';
import { RealFlightsApi } from './RealFlightsApi';

const LOOKUP: KioskLookupResponseDto = {
  kioskToken: 'tok-123',
  expiresAt: '2026-11-12T12:10:00Z',
  booking: {
    bookingId: 'bk-1',
    status: 'CONFIRMED',
    passengers: [{ passengerId: 'p1', passengerType: 'ADULT', firstName: 'Ana', lastName: 'Pérez' }],
    flights: [
      {
        segmentId: 's1',
        flightNumber: 'LA1400',
        origin: 'UIO',
        destination: 'GYE',
        departureAt: '2026-11-12T11:30:00Z',
        arrivalAt: '2026-11-12T12:25:00Z',
        status: 'SCHEDULED',
        checkIn: { window: 'NOT_YET_OPEN', opensAt: '2026-11-10T11:30:00Z', closesAt: '2026-11-12T10:30:00Z' },
        passengers: [{ passengerId: 'p1', checkInStatus: 'NOT_CHECKED_IN' }],
      },
    ],
  },
};

describe('mapKioskLookup', () => {
  it('lleva las horas a la hora local del aeropuerto y completa lo que falta con null', () => {
    const s = mapKioskLookup(LOOKUP);
    const f = s.booking.flights[0];
    expect(s.token).toBe('tok-123');
    expect(f.departureAt).toBe('2026-11-12T06:30:00-05:00');
    expect(f.arrivalAt).toBe('2026-11-12T07:25:00-05:00');
    expect(f.checkIn).toEqual({ window: 'NOT_YET_OPEN', opensAt: '2026-11-10T06:30:00-05:00', closesAt: '2026-11-12T05:30:00-05:00' });
    expect(f.departureTerminal).toBeNull();
    expect(f.passengers[0]).toEqual({ passengerId: 'p1', seat: null, checkInStatus: 'NOT_CHECKED_IN' });
    expect(s.booking.passengers[0]).toEqual({ id: 'p1', type: 'ADULT', firstName: 'Ana', lastName: 'Pérez' });
  });

  it('una ventana o un estado que no conoce no abre el check-in', () => {
    const dto = structuredClone(LOOKUP);
    dto.booking.flights[0].checkIn.window = 'RARA' as never;
    dto.booking.flights[0].passengers[0].checkInStatus = 'RARO' as never;
    const f = mapKioskLookup(dto).booking.flights[0];
    expect(f.checkIn.window).toBe('CLOSED');
    expect(f.passengers[0].checkInStatus).toBe('NOT_CHECKED_IN');
  });
});

describe('mapDepartures', () => {
  const DTO: DeparturesResponseDto = {
    airport: { iataCode: 'UIO', name: 'Mariscal Sucre', city: 'Quito', timeZone: 'America/Guayaquil' },
    date: '2026-11-12',
    departures: [
      { flightNumber: 'LA1400', airline: 'LATAM Airlines', destination: { iataCode: 'GYE', city: 'Guayaquil' }, scheduledTime: '2026-11-12T06:30:00-05:00', estimatedTime: '2026-11-12T06:50:00-05:00', status: 'DELAYED', terminal: null, gate: 'A3' },
      { flightNumber: 'AV1500', airline: 'Avianca', destination: { iataCode: 'GYE', city: 'Guayaquil' }, scheduledTime: '2026-11-12T07:30:00-05:00', status: 'NUEVO', gate: null },
    ],
  };

  it('deja las horas tal cual llegan y acepta nextCursor ausente', () => {
    const page = mapDepartures(DTO);
    expect(page.departures[0].scheduledTime).toBe('2026-11-12T06:30:00-05:00');
    expect(page.departures[0].estimatedTime).toBe('2026-11-12T06:50:00-05:00');
    expect(page.departures[0]).toMatchObject({ status: 'DELAYED', gate: 'A3', terminal: null });
    expect(page.nextCursor).toBeNull();
    expect(page.airport.code).toBe('UIO');
  });

  it('un estado desconocido queda en null (no se inventa) y una puerta ausente en null', () => {
    const second = mapDepartures(DTO).departures[1];
    expect(second.status).toBeNull();
    expect(second.gate).toBeNull();
    expect(second.estimatedTime).toBeNull();
  });
});

describe('RealFlightsApi: kiosko', () => {
  function setup(body: unknown, status = 200) {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
    const log = vi.fn();
    const http = createHttpClient({ baseUrl: 'https://api.test/flights/v1', fetchImpl: fetchImpl as unknown as typeof fetch, getAccessToken: () => 'bearer-de-cuenta', log });
    return { api: new RealFlightsApi(http), fetchImpl, log };
  }
  const callOf = (f: ReturnType<typeof setup>['fetchImpl']) => {
    const [url, init] = f.mock.calls[0] as unknown as [URL, RequestInit];
    return { url: url.toString(), init, headers: init.headers as Record<string, string> };
  };

  it('lookup: POST con código y apellido, sin ninguna credencial', async () => {
    const { api, fetchImpl } = setup(LOOKUP);
    await api.kioskLookup('ABC123', 'Pérez');
    const { url, init, headers } = callOf(fetchImpl);
    expect(url).toBe('https://api.test/flights/v1/kiosk/lookup');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ pnr: 'ABC123', lastName: 'Pérez' });
    expect(headers.Authorization).toBeUndefined();
  });

  it('check-in y pases: Authorization: Kiosk <token>, nunca Bearer', async () => {
    const a = setup({ bookingId: 'bk-1', status: 'COMPLETED', checkedInPassengers: [] });
    await a.api.kioskCheckIn('bk-1', 'tok-123');
    expect(callOf(a.fetchImpl).url).toBe('https://api.test/flights/v1/kiosk/bookings/bk-1/check-in');
    expect(callOf(a.fetchImpl).headers.Authorization).toBe('Kiosk tok-123');
    const b = setup({ bookingId: 'bk-1', boardingPasses: [] });
    await b.api.kioskBoardingPasses('bk-1', 'tok-123');
    expect(callOf(b.fetchImpl).url).toBe('https://api.test/flights/v1/kiosk/bookings/bk-1/boarding-passes');
    expect(callOf(b.fetchImpl).init.method).toBe('GET');
    expect(callOf(b.fetchImpl).headers.Authorization).toBe('Kiosk tok-123');
  });

  it('un error no se registra en el log (la ruta lleva el identificador de la reserva)', async () => {
    const { api, log } = setup({ status: 401, code: 'KIOSK_SESSION_INVALID', detail: 'x' }, 401);
    await expect(api.kioskCheckIn('bk-1', 'tok-123')).rejects.toMatchObject({ status: 401, code: 'KIOSK_SESSION_INVALID' });
    await expect(api.kioskLookup('ABC123', 'Pérez')).rejects.toBeTruthy();
    expect(log).not.toHaveBeenCalled();
  });

  it('salidas: GET con fecha y cursor opcional', async () => {
    const { api, fetchImpl } = setup({ airport: { iataCode: 'UIO', name: 'x', city: 'Quito', timeZone: 'America/Guayaquil' }, date: '2026-11-12', departures: [] });
    await api.getDepartures('UIO', '2026-11-12', { cursor: 'c2' });
    expect(callOf(fetchImpl).url).toBe('https://api.test/flights/v1/airports/UIO/departures?date=2026-11-12&cursor=c2');
  });
});

describe('mock del kiosko', () => {
  it('cubre las tres ventanas, rechaza datos incorrectos con el mismo 404 y un token ajeno con 401', () => {
    resetMockKiosk();
    const now = Date.parse('2026-11-12T12:00:00Z');
    const windows = Object.entries(MOCK_KIOSK_PNRS).map(([w, pnr]) => [w, mockKioskLookup(pnr, MOCK_KIOSK_LAST_NAME, now).booking.flights[0].checkIn.window]);
    expect(Object.fromEntries(windows)).toEqual({ OPEN: 'OPEN', NOT_YET_OPEN: 'NOT_YET_OPEN', CLOSED: 'CLOSED' });
    expect(() => mockKioskLookup('ZZZ999', 'Demo', now)).toThrowError(expect.objectContaining({ status: 404 }));
    expect(() => mockKioskLookup('ABC123', 'Otro', now)).toThrowError(expect.objectContaining({ status: 404 }));
    const open = mockKioskLookup('ABC123', 'demo', now);
    expect(() => mockKioskCheckIn(open.booking.bookingId, 'otro-token', now)).toThrowError(expect.objectContaining({ status: 401, code: 'KIOSK_SESSION_INVALID' }));
    expect(() => mockKioskCheckIn(open.booking.bookingId, open.kioskToken, now + 11 * 60_000)).toThrowError(expect.objectContaining({ status: 401 }));
    const closed = mockKioskLookup('CER789', 'Demo', now);
    expect(() => mockKioskCheckIn(closed.booking.bookingId, closed.kioskToken, now)).toThrowError(expect.objectContaining({ status: 409, code: 'CHECK_IN_NOT_AVAILABLE' }));
    expect(mockKioskBoardingPasses(open.booking.bookingId, open.kioskToken, now).boardingPasses).toEqual([]);
    mockKioskCheckIn(open.booking.bookingId, open.kioskToken, now);
    expect(mockKioskBoardingPasses(open.booking.bookingId, open.kioskToken, now).boardingPasses).toHaveLength(2);
  });

  it('las salidas llegan en hora local con desfase, ordenadas y con páginas', () => {
    const first = mockDepartures('UIO', '2026-11-13');
    expect(first.departures[0].scheduledTime).toMatch(/T\d{2}:\d{2}:00-05:00$/);
    const times = first.departures.map((d) => d.scheduledTime);
    expect([...times].sort()).toEqual(times);
    expect(first.nextCursor ?? null).not.toBe(undefined);
    expect(() => mockDepartures('ZZZ', '2026-11-13')).toThrowError(expect.objectContaining({ status: 404 }));
  });
});
