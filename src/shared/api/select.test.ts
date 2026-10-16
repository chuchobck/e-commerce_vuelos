import { afterEach, describe, expect, it, vi } from 'vitest';
import statusFixture from './__fixtures__/status-la1400.json';
import { GraphqlFlightsApi } from './GraphqlFlightsApi';
import type { HttpClient } from './http/client';
import { FINGERPRINT_PATTERN } from './http/deviceFingerprint';
import { MockFlightsApi } from './mock/MockFlightsApi';
import { RealFlightsApi } from './RealFlightsApi';
import { apiModeFor, createFlightsApi } from './select';

const REST = 'http://localhost:3010/flights/v1';
const BFF = 'http://localhost:4000/graphql';

describe('selección de implementación', () => {
  it('URL vacía (o solo espacios) = mock; con valor = real', () => {
    expect(apiModeFor('')).toBe('mock');
    expect(apiModeFor('   ')).toBe('mock');
    expect(apiModeFor(REST)).toBe('real');
    expect(createFlightsApi('')).toBeInstanceOf(MockFlightsApi);
    expect(createFlightsApi(REST)).toBeInstanceOf(RealFlightsApi);
  });

  describe('las tres combinaciones de VITE_API_URL y VITE_GRAPHQL_URL', () => {
    it('API vacía: mock completo, VITE_GRAPHQL_URL se ignora (no se mezclan)', () => {
      expect(apiModeFor('', BFF)).toBe('mock');
      expect(createFlightsApi('', { graphqlUrl: BFF })).toBeInstanceOf(MockFlightsApi);
      expect(createFlightsApi('  ', { graphqlUrl: BFF })).not.toBeInstanceOf(RealFlightsApi);
    });

    it('solo VITE_API_URL: todo por REST, exactamente la implementación de respaldo de siempre', () => {
      for (const empty of ['', '   ']) {
        expect(apiModeFor(REST, empty)).toBe('real');
        const api = createFlightsApi(REST, { graphqlUrl: empty });
        expect(api).toBeInstanceOf(RealFlightsApi);
        expect(api).not.toBeInstanceOf(GraphqlFlightsApi);
      }
    });

    it('las dos: búsqueda, mapa de asientos y estado de vuelo por GraphQL; el resto, por REST', () => {
      expect(apiModeFor(REST, BFF)).toBe('graphql');
      const api = createFlightsApi(REST, { graphqlUrl: BFF });
      expect(api).toBeInstanceOf(GraphqlFlightsApi);
      // Sigue siendo un RealFlightsApi: cuenta, compra y postventa son los métodos REST heredados, sin tocar.
      expect(api).toBeInstanceOf(RealFlightsApi);
      for (const method of ['search', 'getSeatMap', 'getFlightStatus'] as const) {
        expect(Object.getOwnPropertyNames(GraphqlFlightsApi.prototype)).toContain(method);
      }
      expect(Object.getOwnPropertyNames(GraphqlFlightsApi.prototype).sort()).toEqual(['constructor', 'getFlightStatus', 'getSeatMap', 'search']);
    });
  });
});

describe('apiConfig lee las variables de entorno', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function configWith(api: string, graphql: string, identity = '') {
    vi.stubEnv('VITE_API_URL', api);
    vi.stubEnv('VITE_GRAPHQL_URL', graphql);
    vi.stubEnv('VITE_IDENTITY_URL', identity);
    vi.resetModules();
    return (await import('./config')).apiConfig;
  }

  it('con API real, toma y recorta VITE_GRAPHQL_URL', async () => {
    expect(await configWith(REST, ` ${BFF} `)).toMatchObject({ apiUrl: REST, graphqlUrl: BFF, usingMock: false });
  });

  it('con la API vacía (mock) VITE_GRAPHQL_URL queda vacía aunque tenga valor', async () => {
    expect(await configWith('', BFF)).toMatchObject({ apiUrl: '', graphqlUrl: '', usingMock: true });
  });

  it('sin VITE_GRAPHQL_URL queda vacía (todo por REST)', async () => {
    expect(await configWith(REST, '')).toMatchObject({ graphqlUrl: '', usingMock: false });
  });

  it('VITE_IDENTITY_URL explícita: la cuenta usa esa base', async () => {
    expect(await configWith(REST, '', ' https://id.test/identity/v1/ ')).toMatchObject({ identityUrl: 'https://id.test/identity/v1' });
  });

  it('VITE_IDENTITY_URL vacía: se deriva de VITE_API_URL (/flights/v1 → /identity/v1)', async () => {
    expect(await configWith('https://gw.test/flights/v1', BFF)).toMatchObject({ identityUrl: 'https://gw.test/identity/v1' });
    expect(await configWith(REST, '')).toMatchObject({ identityUrl: 'http://localhost:3010/identity/v1' });
  });

  it('con la API vacía (mock) la cuenta también es del mock: VITE_IDENTITY_URL se ignora', async () => {
    expect(await configWith('', BFF, 'https://id.test/identity/v1')).toMatchObject({ identityUrl: '', usingMock: true });
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
});
