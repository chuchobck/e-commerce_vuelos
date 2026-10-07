import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError } from '../errors';

/** Mock sin errores aleatorios y con base de datos nueva en memoria. */
async function freshApi() {
  vi.stubEnv('VITE_MOCK_ERROR_RATE', '0');
  vi.resetModules();
  const { MockFlightsApi } = await import('./MockFlightsApi');
  return new MockFlightsApi();
}

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as ApiError;
  }
  throw new Error('se esperaba un error');
}

// Reserva de demostración a 21 días: fuera de la ventana de check-in.
const LATER_BOOKING = 'bkg_qg4p9x';

describe('check-in del mock (alineado con la API)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('exige sesión', async () => {
    const api = await freshApi();
    expect((await failure(api.checkIn({ bookingId: LATER_BOOKING }))).status).toBe(401);
  });

  it('una reserva ajena responde 404', async () => {
    const api = await freshApi();
    const other = await api.register({
      email: 'otra@correo.com',
      password: 'clave-segura',
      firstName: 'Ana',
      lastName: 'Vera',
      documentType: 'PASSPORT',
      documentNumber: 'A1234567',
      phone: '991234568',
    });
    expect((await failure(api.checkIn({ bookingId: LATER_BOOKING }, other.token))).status).toBe(404);
  });

  it('fuera de la ventana responde 409 CHECK_IN_NOT_AVAILABLE (código del contrato)', async () => {
    const api = await freshApi();
    const demo = await api.login({ email: 'demo@quinde.ec', password: 'quinde2026' });
    const error = await failure(api.checkIn({ bookingId: LATER_BOOKING }, demo.token));
    expect(error.status).toBe(409);
    expect(error.code).toBe('CHECK_IN_NOT_AVAILABLE');
  });
}, 20_000);
