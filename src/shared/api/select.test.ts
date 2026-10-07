import { describe, expect, it, vi } from 'vitest';
import statusFixture from './__fixtures__/status-la1400.json';
import { NotYetConnectedError } from './errors';
import type { FlightsApi } from './FlightsApi';
import type { HttpClient } from './http/client';
import { FINGERPRINT_PATTERN } from './http/deviceFingerprint';
import { MockFlightsApi } from './mock/MockFlightsApi';
import { RealFlightsApi } from './RealFlightsApi';
import { apiModeFor, createFlightsApi } from './select';

describe('selección de implementación', () => {
  it('URL vacía (o solo espacios) = mock; con valor = real', () => {
    expect(apiModeFor('')).toBe('mock');
    expect(apiModeFor('   ')).toBe('mock');
    expect(apiModeFor('http://localhost:3010/flights/v1')).toBe('real');
    expect(createFlightsApi('')).toBeInstanceOf(MockFlightsApi);
    expect(createFlightsApi('http://localhost:3010/flights/v1')).toBeInstanceOf(RealFlightsApi);
  });
});

function fakeHttp(response: unknown = {}) {
  const request = vi.fn(async () => response);
  return { http: { request } as unknown as HttpClient, request };
}

describe('RealFlightsApi', () => {
  it('pide el mapa de asientos con offerId en la ruta y segmentId en la query, como lectura', async () => {
    const { http, request } = fakeHttp({ segmentId: 's1', cabins: [] });
    await expect(new RealFlightsApi(http).getSeatMap('off/1', 's1')).resolves.toEqual({ segmentId: 's1', cabins: [] });
    expect(request).toHaveBeenCalledWith('GET', '/offers/off%2F1/seatmap', { query: { segmentId: 's1' }, retry: true });
  });

  it('pide el estado de vuelo con número en la ruta y fecha en la query', async () => {
    const { http, request } = fakeHttp(statusFixture);
    const status = await new RealFlightsApi(http).getFlightStatus('LA1400', '2026-10-09');
    expect(request).toHaveBeenCalledWith('GET', '/flights/LA1400/status', { query: { date: '2026-10-09' }, retry: true });
    expect(status.departure.scheduled).toBe('2026-10-09T06:00:00-05:00');
  });

  it('la búsqueda envía la forma del contrato y una huella de dispositivo válida', async () => {
    const { http, request } = fakeHttp({ totalOffers: 0, offers: [] });
    await new RealFlightsApi(http).search({
      origin: 'UIO',
      destination: 'GYE',
      departDate: '2026-10-20',
      passengers: { adults: 1, children: 0, infants: 0 },
      cabin: 'ECONOMY',
    });
    const [method, path, options] = request.mock.calls[0] as unknown as [string, string, { body: unknown; headers: Record<string, string>; retry: boolean }];
    expect([method, path, options.retry]).toEqual(['POST', '/search', true]);
    expect(options.body).toEqual({
      itineraries: [{ origin: 'UIO', destination: 'GYE', departureDate: '2026-10-20' }],
      passengers: { adults: 1, youths: 0, children: 0, infants: 0 },
    });
    expect(options.headers['X-Device-Fingerprint']).toMatch(FINGERPRINT_PATTERN);
  });

  it('lo que aún no está conectado rechaza con NotYetConnectedError, sin llamar a la red', async () => {
    const { http, request } = fakeHttp();
    const api: FlightsApi = new RealFlightsApi(http);
    for (const op of [() => api.getHold('h'), () => api.listBookings(), () => api.checkIn({ bookingId: 'b' })]) {
      await expect(op()).rejects.toBeInstanceOf(NotYetConnectedError);
    }
    expect(request).not.toHaveBeenCalled();
  });
});
