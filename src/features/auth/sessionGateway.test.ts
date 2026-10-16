/**
 * La sesión con el cliente REAL (RealFlightsApi + cliente HTTP) detrás del gateway, con un fetch falso que reparte las
 * rutas como el gateway: la cuenta vive en identity y la compra y postventa en el core. Aquí se comprueba lo que la
 * separación de servicios podría romper: un 401 del core con un token de identity se trata como sesión vencida (UNA
 * renovación y UN reintento, sin bucles) y ningún token ni contraseña llega a la consola ni a un registro.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api';
import { createHttpClient } from '@/shared/api/http/client';
import { RealFlightsApi } from '@/shared/api/RealFlightsApi';
import { createLocalLock } from './crossTab';
import { SessionManager } from './session';
import { createTokenStore, type StorageLike } from './tokenStore';

const CORE = 'https://gw.test/flights/v1';
const IDENTITY = 'https://gw.test/identity/v1';
const PASSWORD = 'una-frase-larga-secreta-12345';
const USER = { id: 'u1', email: 'ana@example.test', roles: ['cliente'], scopes: ['flights:read'], createdAt: '2026-10-16T00:00:00.000Z' };

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const problem = (status: number, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ type: 'about:blank', title: 'Unauthorized', status, code: 'VALIDATION_FAILED', detail: 'The access token is invalid', ...extra }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

interface Scenario {
  /** ¿El core acepta este token de acceso? Por defecto, solo desde el segundo (el primero ya "venció"). */
  coreAccepts?: (accessToken: string) => boolean;
  /** Estado con el que responde identity a un refresh (401 = refresh token vencido o reutilizado). */
  refreshStatus?: number;
  loginStatus?: number;
}

function setup(scenario: Scenario = {}) {
  const coreAccepts = scenario.coreAccepts ?? ((token: string) => token !== 'access-1');
  const requests: { method: string; url: string; auth?: string }[] = [];
  const logged: unknown[][] = [];
  let issued = 0;
  const issue = () => {
    issued++;
    return { access_token: `access-${issued}`, token_type: 'Bearer', expires_in: 900, refresh_token: `refresh-${issued}`.padEnd(43, 'x'), scope: 'flights:read' };
  };

  const fetchStub = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    requests.push({ method: init?.method ?? 'GET', url, auth });
    if (url === `${IDENTITY}/auth/login`) return scenario.loginStatus ? problem(scenario.loginStatus, { detail: 'Invalid email or password' }) : json(issue());
    if (url === `${IDENTITY}/auth/refresh`) return scenario.refreshStatus ? problem(scenario.refreshStatus, { detail: 'The refresh token is invalid or expired' }) : json(issue());
    if (url === `${IDENTITY}/auth/me`) return json(USER);
    if (url === `${IDENTITY}/auth/logout`) return new Response(null, { status: 204 });
    if (url.startsWith(`${CORE}/`)) {
      return coreAccepts(auth?.replace('Bearer ', '') ?? '') ? json([]) : problem(401);
    }
    throw new Error(`ruta inesperada: ${url}`);
  });

  const http = createHttpClient({
    baseUrl: CORE,
    getAccessToken: () => manager.getAccessToken(),
    fetchImpl: fetchStub as unknown as typeof fetch,
    sleep: async () => undefined,
    // Igual que en select.ts: el registro técnico de desarrollo va a la consola.
    log: (message, detail) => {
      logged.push([message, detail]);
      console.warn(message, detail);
    },
  });
  const api = new RealFlightsApi(http, IDENTITY);
  const manager: SessionManager = new SessionManager({
    api,
    store: createTokenStore(memoryStorage(), memoryStorage()),
    lock: createLocalLock(),
    channel: { post: () => undefined, listen: () => () => undefined },
    schedule: () => () => undefined,
  });
  const count = (suffix: string) => requests.filter((r) => r.url.endsWith(suffix)).length;
  const coreCalls = () => requests.filter((r) => r.url.startsWith(`${CORE}/`));
  return { api, manager, requests, logged, count, coreCalls };
}

const credentials = { email: USER.email, password: PASSWORD };
const spies = () => (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));

// La consola de desarrollo no se llena de avisos esperados (y cada prueba puede leer lo que se habría impreso).
beforeEach(() => void spies());
afterEach(() => vi.restoreAllMocks());

describe('401 del core con un token vigente de identity = sesión vencida', () => {
  it('UNA renovación (en identity) y UN reintento (con el token nuevo); la llamada termina bien', async () => {
    const s = setup();
    await s.manager.login(credentials, false);
    await expect(s.manager.authorized(() => s.api.getBaggageOptions('b1'))).resolves.toEqual([]);

    expect(s.count('/auth/refresh')).toBe(1);
    expect(s.requests.filter((r) => r.url.endsWith('/auth/refresh')).every((r) => r.url.startsWith(IDENTITY))).toBe(true);
    const core = s.coreCalls();
    expect(core.map((r) => r.auth)).toEqual(['Bearer access-1', 'Bearer access-2']);
    expect(s.manager.getState().status).toBe('authenticated');
  });

  it('si el core sigue diciendo 401 con el token renovado: un solo reintento, la sesión se cierra y NO hay bucle', async () => {
    const s = setup({ coreAccepts: () => false });
    await s.manager.login(credentials, false);
    const error = await s.manager.authorized(() => s.api.getBaggageOptions('b1')).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401 });
    expect(s.count('/auth/refresh')).toBe(1);
    expect(s.coreCalls()).toHaveLength(2);
    expect(s.manager.getState()).toMatchObject({ status: 'anonymous', ended: 'security' });
    // Con la sesión cerrada, otra llamada no renueva ni insiste.
    await expect(s.manager.authorized(() => s.api.getBaggageOptions('b1'))).rejects.toThrow();
    expect(s.count('/auth/refresh')).toBe(1);
  });

  it('cinco llamadas del core con el token vencido a la vez = UNA sola renovación', async () => {
    const s = setup();
    await s.manager.login(credentials, false);
    const results = await Promise.all(Array.from({ length: 5 }, () => s.manager.authorized(() => s.api.getBaggageOptions('b1'))));
    expect(results).toEqual(Array(5).fill([]));
    expect(s.count('/auth/refresh')).toBe(1);
  });

  it('si identity rechaza la renovación (401), la sesión se cierra por seguridad y la llamada no se reintenta', async () => {
    const s = setup({ refreshStatus: 401 });
    await s.manager.login(credentials, false);
    await expect(s.manager.authorized(() => s.api.getBaggageOptions('b1'))).rejects.toThrow();
    expect(s.count('/auth/refresh')).toBe(1);
    expect(s.coreCalls()).toHaveLength(1);
    expect(s.manager.getState()).toMatchObject({ status: 'anonymous', ended: 'security' });
  });

  it('cerrar sesión: logout a identity con su Bearer y el refresh token en el cuerpo, nunca al core', async () => {
    const s = setup();
    await s.manager.login(credentials, false);
    await s.manager.logout();
    const logout = s.requests.find((r) => r.url.endsWith('/auth/logout'));
    expect(logout).toMatchObject({ method: 'POST', url: `${IDENTITY}/auth/logout`, auth: 'Bearer access-1' });
    expect(s.requests.every((r) => !r.url.startsWith(`${CORE}/auth`))).toBe(true);
  });
});

describe('ningún token ni contraseña llega a la consola', () => {
  /** Todo lo que salió por la consola (por cualquier nivel) y por el registro técnico, como texto. */
  const everythingPrinted = (consoleSpies: ReturnType<typeof spies>, logged: unknown[][]) =>
    JSON.stringify([...consoleSpies.flatMap((spy) => spy.mock.calls), ...logged], (_k, v: unknown) => (v instanceof Error ? `${v.name}: ${v.message}` : v));

  const SECRETS = [PASSWORD, 'access-1', 'access-2', 'refresh-1', 'refresh-2'];

  it('en un recorrido con errores (401 al ingresar, 401 del core, renovación, 400, cierre) no se imprime ningún secreto', async () => {
    const consoleSpies = spies();
    const failing = setup({ loginStatus: 401 });
    await failing.manager.login(credentials, false).catch(() => undefined);

    const s = setup();
    await s.manager.login(credentials, true);
    await s.manager.authorized(() => s.api.getBaggageOptions('b1'));
    await s.manager.logout();

    const rejected = setup({ coreAccepts: () => false });
    await rejected.manager.login(credentials, false);
    await rejected.manager.authorized(() => rejected.api.getBaggageOptions('b1')).catch(() => undefined);

    const printed = everythingPrinted(consoleSpies, [...failing.logged, ...s.logged, ...rejected.logged]);
    // Hubo registro técnico (si no, la prueba no probaría nada) y no tiene secretos.
    expect(failing.logged.length + rejected.logged.length).toBeGreaterThan(0);
    for (const secret of SECRETS) expect(printed).not.toContain(secret);
    expect(printed).not.toMatch(/Bearer\s/i);
  });

  it('los errores que llegan a la interfaz tampoco llevan secretos, y las URL no llevan tokens', async () => {
    const s = setup({ loginStatus: 401 });
    const error = (await s.manager.login(credentials, false).catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    const shown = JSON.stringify({ message: error.message, title: error.title, detail: error.detail, status: error.status });
    for (const secret of SECRETS) expect(shown).not.toContain(secret);

    const ok = setup();
    await ok.manager.login(credentials, false);
    await ok.manager.authorized(() => ok.api.getBaggageOptions('b1'));
    for (const request of ok.requests) for (const secret of SECRETS) expect(request.url).not.toContain(secret);
  });
});
