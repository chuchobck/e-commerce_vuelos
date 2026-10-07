/**
 * Integración de la cuenta contra el backend LOCAL (`npm run test:api`). Escribe datos (crea un
 * usuario con un correo único @example.test), así que NUNCA corre contra Render.
 * No usa la cuenta de administrador sembrada.
 *
 * Límites del backend por IP: login 5/min (los fallidos cuentan), registro 10 cada 10 min,
 * refresh 30/min. Esta prueba usa 2 registros, 2 ingresos correctos y, al final, los intentos
 * fallidos justos para ver un 429.
 */
import { loadEnv } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { createLocalLock } from '../../src/features/auth/crossTab';
import { SessionManager } from '../../src/features/auth/session';
import { createTokenStore, type StorageLike } from '../../src/features/auth/tokenStore';
import { ApiError } from '../../src/shared/api/errors';
import { createHttpClient } from '../../src/shared/api/http/client';
import { RealFlightsApi } from '../../src/shared/api/RealFlightsApi';

const env = loadEnv('development', process.cwd(), '');
const BASE = (process.env.API_TEST_URL || env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const IS_LOCAL = !!BASE && !/onrender\.com/i.test(BASE);

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('se esperaba un error');
}

describe.skipIf(!IS_LOCAL)(`cuenta contra el backend local: ${IS_LOCAL ? BASE : '(omitida: sin URL local)'}`, () => {
  const stamp = Date.now();
  const email = `quinde-test-${stamp}@example.test`;
  const password = `una frase larga de prueba ${stamp}`;

  // El reloj de la sesión se puede adelantar para simular que el access token venció.
  let clockOffset = 0;
  // Un token de acceso que el servidor rechaza, hasta la próxima renovación (simula uno inválido).
  let forcedAccessToken: string | undefined;

  const http = createHttpClient({
    baseUrl: BASE,
    getAccessToken: () => forcedAccessToken ?? manager.getAccessToken(),
  });
  const api = new RealFlightsApi(http);
  const calls = { refresh: 0, refreshErrors: [] as number[] };
  const countedApi = {
    register: api.register.bind(api),
    login: api.login.bind(api),
    logout: api.logout.bind(api),
    me: api.me.bind(api),
    refresh: async (token: string) => {
      calls.refresh++;
      forcedAccessToken = undefined;
      try {
        return await api.refresh(token);
      } catch (e) {
        calls.refreshErrors.push((e as ApiError).status);
        throw e;
      }
    },
  };
  const sessionStore = memoryStorage();
  // La sesión se crea después del cliente HTTP; el cliente solo la lee al hacer peticiones.
  const manager: SessionManager = new SessionManager({
    api: countedApi,
    store: createTokenStore(sessionStore, memoryStorage()),
    lock: createLocalLock(),
    channel: { post: () => undefined, listen: () => () => undefined },
    now: () => Date.now() + clockOffset,
    schedule: () => () => undefined,
  });

  afterAll(() => manager.dispose());

  it('registro: crea un cliente (el rol lo decide el backend) y normaliza el correo', async () => {
    const user = await api.register({ email: `  ${email.toUpperCase()} `, password });
    expect(user.email).toBe(email);
    expect(user.roles).toEqual(['cliente']);
    expect(user.scopes.length).toBeGreaterThan(0);
  });

  it('el mismo correo otra vez es 409', async () => {
    const error = await failure(api.register({ email, password }));
    expect(error).toMatchObject({ status: 409 });
    console.info(`[test:api] 409 al registrar: code=${error.code} detail="${error.detail}"`);
  });

  it('ingreso + /auth/me con la sesión real', async () => {
    const user = await manager.login({ email, password }, false);
    expect(user.email).toBe(email);
    expect(manager.getState().status).toBe('authenticated');
    expect(sessionStore.getItem('quinde.auth.refresh')).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('CONCURRENCIA: token vencido + 5 llamadas a la vez = UNA renovación, todas responden, sin reutilización', async () => {
    const before = calls.refresh;
    clockOffset = 16 * 60_000; // el access token "venció" para la sesión
    const results = await Promise.all(Array.from({ length: 5 }, () => manager.authorized(() => api.me())));
    clockOffset = 0;
    const burst = calls.refresh - before;
    expect(results.map((u) => u.email)).toEqual(Array(5).fill(email));
    expect(burst).toBe(1);
    expect(calls.refreshErrors).toEqual([]);
    // La familia sigue viva: otra renovación funciona (si el backend hubiera visto una reutilización, daría 401).
    await manager.refresh();
    await expect(manager.authorized(() => api.me())).resolves.toMatchObject({ email });
    console.info(`[test:api] concurrencia: 5 llamadas a la vez con el token vencido → ${burst} renovación, 0 errores de renovación`);
  });

  it('401 reactivo: un access token rechazado se renueva una vez y la petición se reintenta una vez', async () => {
    const before = calls.refresh;
    forcedAccessToken = 'no.es.valido';
    await expect(manager.authorized(() => api.me())).resolves.toMatchObject({ email });
    expect(calls.refresh - before).toBe(1);
  });

  it('rotación: el refresh token viejo ya no sirve; reusarlo revoca toda la sesión', async () => {
    const old = sessionStore.getItem('quinde.auth.refresh')!;
    await manager.refresh();
    const current = sessionStore.getItem('quinde.auth.refresh')!;
    expect(current).not.toBe(old);
    const reuse = await failure(api.refresh(old));
    expect(reuse.status).toBe(401);
    console.info(`[test:api] reuso del refresh viejo: ${reuse.status} code=${reuse.code} detail="${reuse.detail}"`);
    // La API revoca la familia: el token vigente también dejó de servir.
    expect((await failure(api.refresh(current))).status).toBe(401);
    // La sesión lo detecta al renovar y se cierra "por seguridad".
    await expect(manager.refresh()).rejects.toThrow();
    expect(manager.getState()).toMatchObject({ status: 'anonymous', ended: 'security' });
  });

  it('cerrar sesión revoca el refresh token en la API y limpia el almacén', async () => {
    await manager.login({ email, password }, false);
    const token = sessionStore.getItem('quinde.auth.refresh')!;
    await manager.logout();
    expect(sessionStore.getItem('quinde.auth.refresh')).toBeNull();
    expect((await failure(api.refresh(token))).status).toBe(401);
  });

  it('demasiados ingresos fallidos: 429 con Retry-After (se detiene en el primero)', async () => {
    let limited: ApiError | undefined;
    for (let i = 0; i < 6 && !limited; i++) {
      const error = await failure(api.login({ email, password: `${password} equivocada` }));
      if (error.status === 429) limited = error;
      else expect(error.status).toBe(401);
    }
    expect(limited).toBeDefined();
    expect(limited!.retryAfter).toBeGreaterThan(0);
    console.info(`[test:api] 429 al ingresar: Retry-After=${limited!.retryAfter} s`);
  }, 30_000);
});
