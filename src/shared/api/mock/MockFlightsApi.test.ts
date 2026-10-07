import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../errors';
import type { MockFlightsApi } from './MockFlightsApi';

/**
 * Mock sin errores aleatorios y con base de datos nueva en memoria. El token de acceso lo pone
 * la prueba, como lo haría el módulo de sesión.
 */
async function freshApi() {
  vi.stubEnv('VITE_MOCK_ERROR_RATE', '0');
  vi.resetModules();
  const { MockFlightsApi } = await import('./MockFlightsApi');
  const auth = { token: undefined as string | undefined };
  const api: MockFlightsApi = new MockFlightsApi(() => auth.token);
  return { api, auth };
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('se esperaba un error');
}

const DEMO = { email: 'demo@quinde.ec', password: 'quinde-demo-2026' };
const PASSWORD = 'una frase larga de prueba';
// Reserva de demostración a 21 días: fuera de la ventana de check-in.
const LATER_BOOKING = 'bkg_qg4p9x';

describe('cuenta del mock (mismas reglas y errores que /auth/* de la API)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('registro: devuelve el usuario (sin tokens), normaliza el correo y da 409 si ya existe', async () => {
    const { api } = await freshApi();
    const user = await api.register({ email: '  Ana@Correo.EC ', password: PASSWORD });
    expect(user).toMatchObject({ email: 'ana@correo.ec', roles: ['cliente'] });
    expect(user).not.toHaveProperty('passwordHash');
    const dup = await failure(api.register({ email: 'ana@correo.ec', password: PASSWORD }));
    expect([dup.status, dup.code]).toEqual([409, 'VALIDATION_FAILED']);
  });

  it('400 por campo con las mismas reglas del backend', async () => {
    const { api } = await freshApi();
    const short = await failure(api.register({ email: 'ana@correo.ec', password: 'corta' }));
    expect(short.status).toBe(400);
    expect(short.fieldErrors[0].field).toBe('password');
    const email = await failure(api.login({ email: 'ana@', password: PASSWORD }));
    expect(email.fieldErrors[0].field).toBe('email');
  });

  it('login: 401 genérico para correo inexistente o contraseña errónea', async () => {
    const { api } = await freshApi();
    const unknown = await failure(api.login({ email: 'nadie@correo.ec', password: PASSWORD }));
    const wrong = await failure(api.login({ ...DEMO, password: 'otra contraseña larga' }));
    expect([unknown.status, wrong.status]).toEqual([401, 401]);
    expect(unknown.detail).toBe(wrong.detail);
  });

  it('refresh rota el token; reusar el viejo revoca la familia completa', async () => {
    const { api } = await freshApi();
    const first = await api.login(DEMO);
    expect(first.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const second = await api.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect((await failure(api.refresh(first.refreshToken))).status).toBe(401);
    // La familia quedó revocada: el token nuevo tampoco sirve.
    expect((await failure(api.refresh(second.refreshToken))).status).toBe(401);
  });

  it('/auth/me y logout exigen el token de acceso; logout revoca el refresh token', async () => {
    const { api, auth } = await freshApi();
    expect((await failure(api.me())).status).toBe(401);
    const tokens = await api.login(DEMO);
    auth.token = tokens.accessToken;
    expect((await api.me()).email).toBe(DEMO.email);
    await api.logout(tokens.refreshToken);
    expect((await failure(api.refresh(tokens.refreshToken))).status).toBe(401);
  });
}, 20_000);

describe('check-in del mock (alineado con la API)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('exige sesión', async () => {
    const { api } = await freshApi();
    expect((await failure(api.checkIn({ bookingId: LATER_BOOKING }))).status).toBe(401);
  });

  it('una reserva ajena responde 404', async () => {
    const { api, auth } = await freshApi();
    await api.register({ email: 'otra@correo.com', password: PASSWORD });
    auth.token = (await api.login({ email: 'otra@correo.com', password: PASSWORD })).accessToken;
    expect((await failure(api.checkIn({ bookingId: LATER_BOOKING }))).status).toBe(404);
  });

  it('fuera de la ventana responde 409 CHECK_IN_NOT_AVAILABLE (código del contrato)', async () => {
    const { api, auth } = await freshApi();
    auth.token = (await api.login(DEMO)).accessToken;
    const error = await failure(api.checkIn({ bookingId: LATER_BOOKING }));
    expect(error.status).toBe(409);
    expect(error.code).toBe('CHECK_IN_NOT_AVAILABLE');
  });
}, 20_000);
