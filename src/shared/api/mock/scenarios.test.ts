import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../errors';
import type { SearchParams } from '../types';
import { activeScenario, MOCK_SCENARIOS, planFor, RATE_LIMITED_CALL, resetScenarioState, SLOW_FIRST_SEARCH_MS } from './scenarios';

beforeEach(() => {
  resetScenarioState();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const route = (origin: string, destination: string) => ({ origin, destination });

describe('escenario de la URL', () => {
  it('lee ?escenario= solo si es uno conocido', () => {
    expect(activeScenario('?escenario=sin-vuelos')).toBe('sin-vuelos');
    expect(activeScenario('?otra=1&escenario=lento')).toBe('lento');
    expect(activeScenario('?escenario=inventado')).toBeNull();
    expect(activeScenario('')).toBeNull();
  });

  it('sin navegador (pruebas en Node) no hay escenario', () => {
    expect(activeScenario()).toBeNull();
  });

  it('con location lee la URL actual', () => {
    vi.stubGlobal('location', { search: '?escenario=servidor-caido' });
    expect(activeScenario()).toBe('servidor-caido');
  });
});

describe('qué le pasa a cada búsqueda', () => {
  it('sin escenario todo responde normal', () => {
    expect(planFor(null, route('UIO', 'GYE'))).toEqual({ extraDelayMs: 0, failure: null, noFlights: false });
  });

  it('sin-vuelos: ninguna ruta tiene vuelos', () => {
    expect(planFor('sin-vuelos', route('UIO', 'GYE')).noFlights).toBe(true);
    expect(planFor('sin-vuelos', route('GYE', 'GPS')).noFlights).toBe(true);
  });

  it('ruta-sin-vuelos: solo Quito–Cuenca', () => {
    expect(planFor('ruta-sin-vuelos', route('UIO', 'CUE')).noFlights).toBe(true);
    expect(planFor('ruta-sin-vuelos', route('UIO', 'GYE')).noFlights).toBe(false);
    expect(planFor('ruta-sin-vuelos', route('CUE', 'UIO')).noFlights).toBe(false);
  });

  it('limite-429: solo la búsqueda número 3 responde 429; después ya responde bien (como al esperar el Retry-After)', () => {
    const failures = Array.from({ length: 6 }, () => planFor('limite-429', route('UIO', 'GYE')).failure);
    expect(failures).toEqual([null, null, 429, null, null, null]);
    expect(RATE_LIMITED_CALL).toBe(3);
  });

  it('error-503: falla siempre Guayaquil–Baltra y nada más', () => {
    expect(planFor('error-503', route('GYE', 'GPS')).failure).toBe(503);
    expect(planFor('error-503', route('GYE', 'GPS')).failure).toBe(503);
    expect(planFor('error-503', route('UIO', 'GYE')).failure).toBeNull();
  });

  it('servidor-caido: todas responden 503', () => {
    expect(planFor('servidor-caido', route('UIO', 'GYE')).failure).toBe(503);
    expect(planFor('servidor-caido', route('GYE', 'CUE')).failure).toBe(503);
  });

  it('lento: solo la primera búsqueda tarda más (como el arranque en frío)', () => {
    expect(planFor('lento', route('UIO', 'GYE')).extraDelayMs).toBe(SLOW_FIRST_SEARCH_MS);
    expect(planFor('lento', route('UIO', 'CUE')).extraDelayMs).toBe(0);
    expect(SLOW_FIRST_SEARCH_MS).toBeGreaterThan(8000); // más que el aviso «estamos despertando el servidor»
  });

  it('hay un nombre y un caso por cada escenario', () => {
    expect(new Set(MOCK_SCENARIOS).size).toBe(MOCK_SCENARIOS.length);
    for (const scenario of MOCK_SCENARIOS) {
      resetScenarioState();
      const plans = [route('UIO', 'CUE'), route('GYE', 'GPS'), route('UIO', 'GYE'), route('GYE', 'CUE')].map((r) => planFor(scenario, r));
      expect(plans.some((p) => p.noFlights || p.failure || p.extraDelayMs > 0), scenario).toBe(true);
    }
  });
});

/** Mock sin errores aleatorios (salvo lo que se pida) y con módulos nuevos en cada prueba. */
async function freshApi(errorRate = '0') {
  vi.stubEnv('VITE_MOCK_ERROR_RATE', errorRate);
  vi.resetModules();
  const { MockFlightsApi } = await import('./MockFlightsApi');
  const scenarios = await import('./scenarios');
  scenarios.resetScenarioState();
  return new MockFlightsApi(() => undefined);
}

const day = () => new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
const params = (origin: string, destination: string): SearchParams => ({ origin, destination, departDate: day(), passengers: { adults: 1, children: 0, infants: 0 }, cabin: 'ECONOMY' });

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('se esperaba un error');
}

describe('búsqueda del mock con escenarios (misma forma que el contrato)', () => {
  it('sin escenario hay ofertas en una ruta popular', async () => {
    const api = await freshApi();
    expect((await api.search(params('UIO', 'GYE'))).offers.length).toBeGreaterThan(1);
  });

  it('sin-vuelos devuelve 200 con la lista vacía', async () => {
    const api = await freshApi();
    vi.stubGlobal('location', { search: '?escenario=sin-vuelos' });
    expect((await api.search(params('UIO', 'GYE'))).offers).toEqual([]);
  });

  it('ruta-sin-vuelos vacía solo Quito–Cuenca', async () => {
    const api = await freshApi();
    vi.stubGlobal('location', { search: '?escenario=ruta-sin-vuelos' });
    expect((await api.search(params('UIO', 'CUE'))).offers).toEqual([]);
    expect((await api.search(params('UIO', 'GYE'))).offers.length).toBeGreaterThan(0);
  });

  it('limite-429 responde 429 con Retry-After en la tercera búsqueda y luego se recupera', async () => {
    const api = await freshApi();
    vi.stubGlobal('location', { search: '?escenario=limite-429' });
    await api.search(params('UIO', 'GYE'));
    await api.search(params('UIO', 'CUE'));
    const error = await failure(api.search(params('GYE', 'GPS')));
    expect(error).toMatchObject({ status: 429, code: 'RATE_LIMIT_EXCEEDED', retryAfter: 10 });
    expect((await api.search(params('GYE', 'GPS'))).offers.length).toBeGreaterThan(0);
  });

  it('error-503 falla Guayaquil–Baltra con Retry-After y deja las demás', async () => {
    const api = await freshApi();
    vi.stubGlobal('location', { search: '?escenario=error-503' });
    expect(await failure(api.search(params('GYE', 'GPS')))).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE', retryAfter: 5 });
    expect((await api.search(params('UIO', 'GYE'))).offers.length).toBeGreaterThan(0);
  });

  it('servidor-caido falla todas con 503', async () => {
    const api = await freshApi();
    vi.stubGlobal('location', { search: '?escenario=servidor-caido' });
    expect((await failure(api.search(params('UIO', 'GYE')))).status).toBe(503);
  });

  it('lento: la primera búsqueda no responde antes de 12 s y después sí; la siguiente es normal', async () => {
    const api = await freshApi();
    vi.stubGlobal('location', { search: '?escenario=lento' });
    vi.useFakeTimers();
    let done = false;
    const first = api.search(params('UIO', 'GYE')).then((r) => ((done = true), r));
    await vi.advanceTimersByTimeAsync(SLOW_FIRST_SEARCH_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await first).offers.length).toBeGreaterThan(0);
    let secondDone = false;
    const second = api.search(params('UIO', 'CUE')).then((r) => ((secondDone = true), r));
    await vi.advanceTimersByTimeAsync(900);
    await second;
    expect(secondDone).toBe(true);
  });

  it('cancelar una búsqueda lenta la corta con ABORTED sin esperar los 12 s', async () => {
    const api = await freshApi();
    vi.stubGlobal('location', { search: '?escenario=lento' });
    const controller = new AbortController();
    const pending = failure(api.search(params('UIO', 'GYE'), { signal: controller.signal }));
    controller.abort();
    expect((await pending).code).toBe('ABORTED');
  });
});

describe('errores aleatorios del mock', () => {
  it('con tasa 1 una búsqueda normal falla; una de fondo (background) nunca', async () => {
    const api = await freshApi('1');
    expect([429, 503]).toContain((await failure(api.search(params('UIO', 'GYE')))).status);
    expect((await api.search(params('UIO', 'GYE'), { background: true })).offers.length).toBeGreaterThan(0);
  });

  it('cada búsqueda deja una marca mock:search en performance (sirve para contar peticiones)', async () => {
    const api = await freshApi();
    performance.clearMarks('mock:search');
    await api.search(params('UIO', 'GYE'));
    await api.search(params('UIO', 'CUE'));
    expect(performance.getEntriesByName('mock:search')).toHaveLength(2);
  });
});
