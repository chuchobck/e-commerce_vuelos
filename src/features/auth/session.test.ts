import { describe, expect, it, vi } from 'vitest';
import { ApiError, type AuthTokens, type Credentials, type User } from '@/shared/api';
import { createLocalLock, type ChannelLike, type SessionMessage } from './crossTab';
import { REFRESH_SKEW_MS, SessionManager, type AuthApi } from './session';
import { createTokenStore, type StorageLike } from './tokenStore';

const USER: User = { id: 'u1', email: 'ana@example.test', roles: ['cliente'], scopes: ['flights:read'], createdAt: '2026-10-07T00:00:00Z' };
const T0 = Date.parse('2026-10-07T12:00:00Z');

function memoryStorage(): StorageLike & { dump: () => Record<string, string> } {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    dump: () => Object.fromEntries(data),
  };
}

/** JWT sin firma con el `exp` pedido (la sesión solo lee el payload). */
function jwt(expSeconds: number, n: number): string {
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '');
  return `${enc({ alg: 'none' })}.${enc({ sub: 'u1', exp: expSeconds, n })}.x`;
}

/**
 * API falsa con las reglas de la real: cada refresh token sirve UNA vez; reusar uno ya rotado
 * revoca la familia (401) y anota la reutilización para que la prueba la detecte.
 */
function fakeApi(clock: () => number) {
  let counter = 0;
  const live = new Set<string>();
  const used = new Set<string>();
  const stats = { refreshCalls: 0, reuseDetected: 0, revoked: false, meCalls: 0, logoutCalls: [] as string[] };
  const issue = (): AuthTokens => {
    counter++;
    const refreshToken = `rt-${counter}`.padEnd(43, 'x');
    live.add(refreshToken);
    return { accessToken: jwt(Math.floor(clock() / 1000) + 900, counter), refreshToken, expiresIn: 900, scope: 'flights:read' };
  };
  const api: AuthApi & { stats: typeof stats; issue: () => AuthTokens } = {
    stats,
    issue,
    register: async (_c: Credentials) => USER,
    login: async () => issue(),
    refresh: async (token) => {
      stats.refreshCalls++;
      await Promise.resolve();
      if (used.has(token)) {
        stats.reuseDetected++;
        stats.revoked = true;
        live.clear();
      }
      if (stats.revoked || !live.has(token)) throw new ApiError({ status: 401, code: 'VALIDATION_FAILED' });
      live.delete(token);
      used.add(token);
      return issue();
    },
    logout: async (token) => {
      stats.logoutCalls.push(token);
    },
    me: async () => {
      stats.meCalls++;
      return USER;
    },
  };
  return api;
}

/** Bus de mensajes compartido entre "pestañas" (entrega síncrona, como un BroadcastChannel inmediato). */
function fakeBus() {
  const handlers = new Set<(m: SessionMessage) => void>();
  const channel = (): ChannelLike => ({
    post: (m) => handlers.forEach((h) => h(m)),
    listen: (h) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
  });
  return { channel };
}

function tab(opts: {
  api: AuthApi;
  session?: StorageLike;
  local?: StorageLike;
  lock?: ReturnType<typeof createLocalLock>;
  channel?: ChannelLike;
  clock?: () => number;
}) {
  const scheduled: number[] = [];
  const manager = new SessionManager({
    api: opts.api,
    store: createTokenStore(opts.session ?? memoryStorage(), opts.local ?? memoryStorage(), opts.clock ?? (() => T0)),
    lock: opts.lock ?? createLocalLock(),
    channel: opts.channel ?? { post: () => undefined, listen: () => () => undefined },
    now: opts.clock ?? (() => T0),
    schedule: (_fn, ms) => {
      scheduled.push(ms);
      return () => undefined;
    },
    sleep: async () => undefined,
  });
  return { manager, scheduled };
}

const unauthorized = () => new ApiError({ status: 401, code: 'VALIDATION_FAILED' });

describe('almacén según "Mantener mi sesión iniciada"', () => {
  it('sin marcar: el refresh token va a sessionStorage; el access token a ningún almacén', async () => {
    const session = memoryStorage();
    const local = memoryStorage();
    const { manager } = tab({ api: fakeApi(() => T0), session, local });
    await manager.login({ email: 'ana@example.test', password: 'una frase larga' }, false);
    expect(Object.keys(session.dump())).toEqual(['quinde.auth.refresh']);
    expect(local.dump()['quinde.auth.refresh']).toBeUndefined();
    expect(JSON.stringify([session.dump(), local.dump()])).not.toContain(manager.getAccessToken());
    expect(manager.getState()).toMatchObject({ status: 'authenticated', user: USER });
  });

  it('marcada: va a localStorage (y se borra de sessionStorage)', async () => {
    const session = memoryStorage();
    const local = memoryStorage();
    session.setItem('quinde.auth.refresh', 'viejo');
    const { manager } = tab({ api: fakeApi(() => T0), session, local });
    await manager.login({ email: 'ana@example.test', password: 'una frase larga' }, true);
    expect(local.dump()['quinde.auth.refresh']).toBeTruthy();
    expect(session.dump()['quinde.auth.refresh']).toBeUndefined();
  });
});

describe('renovación', () => {
  it('single-flight: 10 renovaciones simultáneas = 1 petición', async () => {
    const api = fakeApi(() => T0);
    const { manager } = tab({ api });
    await manager.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, false);
    await Promise.all(Array.from({ length: 10 }, () => manager.refresh()));
    expect(api.stats.refreshCalls).toBe(1);
    expect(api.stats.reuseDetected).toBe(0);
  });

  it('proactiva: con el token por vencer, 5 peticiones a la vez renuevan UNA vez y todas responden', async () => {
    let now = T0;
    const api = fakeApi(() => now);
    const { manager } = tab({ api, clock: () => now });
    await manager.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, false);
    now += 900_000 - REFRESH_SKEW_MS + 1_000; // dentro del margen de vencimiento
    const results = await Promise.all(Array.from({ length: 5 }, () => manager.authorized(() => api.me())));
    expect(results).toHaveLength(5);
    expect(api.stats.refreshCalls).toBe(1);
  });

  it('programa la renovación proactiva poco antes de exp', async () => {
    const { manager, scheduled } = tab({ api: fakeApi(() => T0) });
    await manager.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, false);
    expect(scheduled.at(-1)).toBe(900_000 - REFRESH_SKEW_MS - 5_000);
  });

  it('un reloj local adelantado no provoca renovaciones en bucle (usa expires_in, no el exp del JWT)', async () => {
    // El servidor emite con su hora; el equipo va 16 minutos adelante: el `exp` ya "pasó" localmente.
    const api = fakeApi(() => T0);
    const { manager, scheduled } = tab({ api, clock: () => T0 + 16 * 60_000 });
    await manager.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, false);
    expect(scheduled.at(-1)).toBe(900_000 - REFRESH_SKEW_MS - 5_000);
    await manager.authorized(async () => 'ok');
    expect(api.stats.refreshCalls).toBe(0);
  });

  it('reactiva: ante un 401 renueva una vez y reintenta la petición una vez', async () => {
    const api = fakeApi(() => T0);
    const { manager } = tab({ api });
    await manager.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, false);
    const call = vi.fn().mockRejectedValueOnce(unauthorized()).mockResolvedValueOnce('ok');
    await expect(manager.authorized(call)).resolves.toBe('ok');
    expect(call).toHaveBeenCalledTimes(2);
    expect(api.stats.refreshCalls).toBe(1);
  });

  it('un segundo 401 cierra la sesión (sin un tercer intento)', async () => {
    const api = fakeApi(() => T0);
    const { manager } = tab({ api });
    await manager.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, false);
    const call = vi.fn().mockRejectedValue(unauthorized());
    await expect(manager.authorized(call)).rejects.toMatchObject({ status: 401 });
    expect(call).toHaveBeenCalledTimes(2);
    expect(manager.getState()).toMatchObject({ status: 'anonymous', ended: 'security' });
  });

  it('5 peticiones que reciben 401 a la vez comparten UNA renovación', async () => {
    const api = fakeApi(() => T0);
    const { manager } = tab({ api });
    await manager.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, false);
    const stale = manager.getAccessToken();
    const call = () => (manager.getAccessToken() === stale ? Promise.reject(unauthorized()) : Promise.resolve('ok'));
    await expect(Promise.all(Array.from({ length: 5 }, () => manager.authorized(call)))).resolves.toEqual(Array(5).fill('ok'));
    expect(api.stats.refreshCalls).toBe(1);
  });

  it('si la renovación es rechazada (vencida o reutilizada) limpia todo y avisa "por seguridad"', async () => {
    const session = memoryStorage();
    const api = fakeApi(() => T0);
    const { manager } = tab({ api, session });
    await manager.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, false);
    api.stats.revoked = true;
    await expect(manager.refresh()).rejects.toThrow();
    expect(manager.getState()).toMatchObject({ status: 'anonymous', user: null, ended: 'security' });
    expect(manager.getAccessToken()).toBeUndefined();
    expect(session.dump()['quinde.auth.refresh']).toBeUndefined();
  });

  it('un error de red al renovar NO cierra la sesión', async () => {
    const api = fakeApi(() => T0);
    const { manager } = tab({ api });
    await manager.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, false);
    api.refresh = async () => {
      throw new ApiError({ status: 0, code: 'NETWORK' });
    };
    await expect(manager.refresh()).rejects.toMatchObject({ code: 'NETWORK' });
    expect(manager.getState().status).toBe('authenticated');
  });
});

describe('entre pestañas', () => {
  it('dos pestañas con la sesión compartida (localStorage) nunca usan el mismo refresh token', async () => {
    const api = fakeApi(() => T0);
    const local = memoryStorage();
    const lock = createLocalLock(); // el mismo candado para ambas, como navigator.locks
    const bus = fakeBus();
    const a = tab({ api, local, lock, channel: bus.channel() }).manager;
    const b = tab({ api, local, lock, channel: bus.channel() }).manager;
    await a.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, true);
    await b.restore();
    // Las dos renuevan "a la vez".
    await Promise.all([a.refresh(), b.refresh(), a.refresh(), b.refresh()]);
    expect(api.stats.reuseDetected).toBe(0);
    expect(a.getState().status).toBe('authenticated');
    expect(b.getState().status).toBe('authenticated');
  });

  it('una pestaña duplicada (copia vieja en su sessionStorage) recibe el token nuevo y no lo reusa', async () => {
    const api = fakeApi(() => T0);
    const local = memoryStorage();
    const lock = createLocalLock();
    const bus = fakeBus();
    const sessionA = memoryStorage();
    const a = tab({ api, session: sessionA, local, lock, channel: bus.channel() }).manager;
    await a.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, false);
    // "Duplicar pestaña" copia el sessionStorage.
    const sessionB = memoryStorage();
    sessionB.setItem('quinde.auth.refresh', sessionA.getItem('quinde.auth.refresh')!);
    const b = tab({ api, session: sessionB, local, lock, channel: bus.channel() }).manager;
    await a.refresh();
    await b.restore();
    expect(api.stats.reuseDetected).toBe(0);
    expect(b.getState().status).toBe('authenticated');
  });

  it('si la copia vieja no recibe el aviso, la pestaña NO la envía (evita revocar la sesión de todas)', async () => {
    const api = fakeApi(() => T0);
    const local = memoryStorage();
    const sessionA = memoryStorage();
    const a = tab({ api, session: sessionA, local }).manager; // sin canal compartido
    await a.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, false);
    const sessionB = memoryStorage();
    sessionB.setItem('quinde.auth.refresh', sessionA.getItem('quinde.auth.refresh')!);
    await a.refresh(); // rota y marca la huella del token viejo en localStorage
    const b = tab({ api, session: sessionB, local }).manager;
    await b.restore();
    expect(api.stats.reuseDetected).toBe(0);
    expect(b.getState().status).toBe('anonymous');
    expect(a.getState().status).toBe('authenticated');
  });

  it('cerrar sesión en una pestaña la cierra en las demás del mismo usuario', async () => {
    const api = fakeApi(() => T0);
    const local = memoryStorage();
    const bus = fakeBus();
    const lock = createLocalLock();
    const a = tab({ api, local, lock, channel: bus.channel() }).manager;
    const b = tab({ api, local, lock, channel: bus.channel() }).manager;
    await a.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, true);
    await b.restore();
    await a.logout();
    expect(api.stats.logoutCalls).toHaveLength(1);
    expect(b.getState()).toMatchObject({ status: 'anonymous', ended: 'elsewhere' });
    expect(local.dump()['quinde.auth.refresh']).toBeUndefined();
  });
});

describe('cierre de sesión y restauración', () => {
  it('si POST /auth/logout falla, la sesión local se cierra igual', async () => {
    const session = memoryStorage();
    const api = fakeApi(() => T0);
    const { manager } = tab({ api, session });
    await manager.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, false);
    api.logout = async () => {
      throw new ApiError({ status: 0, code: 'NETWORK' });
    };
    await manager.logout();
    expect(manager.getState()).toMatchObject({ status: 'anonymous', ended: null });
    expect(session.dump()['quinde.auth.refresh']).toBeUndefined();
  });

  it('sin token guardado, restaurar termina en "anónimo" sin llamar a la API', async () => {
    const api = fakeApi(() => T0);
    const { manager } = tab({ api });
    expect(manager.getState().status).toBe('restoring');
    await manager.restore();
    expect(manager.getState().status).toBe('anonymous');
    expect(api.stats.refreshCalls).toBe(0);
  });

  it('sin conexión al restaurar: "no disponible" (no anónimo), el token sigue guardado y reintentar funciona', async () => {
    const api = fakeApi(() => T0);
    const session = memoryStorage();
    await tab({ api, session }).manager.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, false);
    const realMe = api.me;
    api.me = async () => {
      throw new ApiError({ status: 0, code: 'NETWORK' });
    };
    const reloaded = tab({ api, session }).manager;
    await reloaded.restore();
    expect(reloaded.getState()).toMatchObject({ status: 'unavailable', user: null, ended: null, restoreError: { code: 'NETWORK' } });
    expect(session.dump()['quinde.auth.refresh']).toBeDefined();
    api.me = realMe;
    const refreshes = api.stats.refreshCalls;
    await reloaded.retryRestore();
    expect(reloaded.getState()).toMatchObject({ status: 'authenticated', user: USER });
    // El access token de la renovación anterior sigue vigente: el reintento no renueva otra vez.
    expect(api.stats.refreshCalls).toBe(refreshes);
  });

  it('restaurar dos veces (StrictMode) hace una sola renovación', async () => {
    const api = fakeApi(() => T0);
    const session = memoryStorage();
    const first = tab({ api, session }).manager;
    await first.login({ email: 'a@b.cc', password: 'x'.repeat(12) }, false);
    const reloaded = tab({ api, session }).manager;
    await Promise.all([reloaded.restore(), reloaded.restore()]);
    expect(api.stats.refreshCalls).toBe(1);
    expect(reloaded.getState()).toMatchObject({ status: 'authenticated', user: USER });
  });

  it('registrar = crear la cuenta y después ingresar (la API no entrega tokens al registrar)', async () => {
    const api = fakeApi(() => T0);
    const register = vi.spyOn(api, 'register');
    const login = vi.spyOn(api, 'login');
    const { manager } = tab({ api });
    await manager.register({ email: 'a@b.cc', password: 'x'.repeat(12) }, false);
    expect(register).toHaveBeenCalledOnce();
    expect(login).toHaveBeenCalledOnce();
    expect(manager.getState().status).toBe('authenticated');
  });
});
