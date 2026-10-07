import { apiConfig } from '../config';
import { ApiError, type ApiErrorCode } from '../errors';

/** Estados de error que el mock puede simular para diseñar los estados de la interfaz. */
export type SimulatedStatus = 409 | 422 | 503;

const FORCE_KEY = 'quinde.mock.forceError';

const CODES: Record<SimulatedStatus, ApiErrorCode> = {
  409: 'CONFLICT',
  422: 'VALIDATION',
  503: 'SERVICE_UNAVAILABLE',
};

/** Espera entre 300 y 800 ms para simular la red. */
export function latency(min = 300, max = 800): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lee un error forzado desde localStorage, útil para probar estados:
 *   localStorage.setItem('quinde.mock.forceError', 'search:503')
 *   localStorage.setItem('quinde.mock.forceError', '*:409')
 */
function forcedStatus(operation: string): SimulatedStatus | null {
  try {
    const raw = localStorage.getItem(FORCE_KEY);
    if (!raw) return null;
    const [op, status] = raw.split(':');
    if (op !== '*' && op !== operation) return null;
    const n = Number(status) as SimulatedStatus;
    return n in CODES ? n : null;
  } catch {
    return null;
  }
}

/** Lanza ocasionalmente uno de los errores permitidos para la operación. */
export function maybeFail(operation: string, allowed: SimulatedStatus[]): void {
  const forced = forcedStatus(operation);
  if (forced) throw new ApiError(forced, CODES[forced], `Error simulado (${operation})`);
  if (allowed.length === 0 || Math.random() >= apiConfig.mockErrorRate) return;
  const status = allowed[Math.floor(Math.random() * allowed.length)];
  throw new ApiError(status, CODES[status], `Error simulado (${operation})`);
}

/** Simula red: latencia + error ocasional. */
export async function simulate(operation: string, allowed: SimulatedStatus[]): Promise<void> {
  await latency();
  maybeFail(operation, allowed);
}

/** Operaciones de la API simulada que aceptan un error forzado. */
export const MOCK_OPERATIONS = [
  'search',
  'createHold',
  'getHold',
  'cancelHold',
  'getSeatMap',
  'createBooking',
  'listBookings',
  'getBooking',
  'cancelBooking',
  'checkIn',
  'getBoardingPasses',
  'getFlightStatus',
  'login',
  'register',
] as const;

export const SIMULATED_STATUSES: SimulatedStatus[] = [409, 422, 503];

/** Error forzado actual, p. ej. "search:503" o "*:409"; null si no hay. */
export function getForcedError(): string | null {
  try {
    return localStorage.getItem(FORCE_KEY);
  } catch {
    return null;
  }
}

export function setForcedError(operation: string, status: SimulatedStatus | null): void {
  try {
    if (status === null) localStorage.removeItem(FORCE_KEY);
    else localStorage.setItem(FORCE_KEY, `${operation}:${status}`);
  } catch {
    /* sin almacenamiento */
  }
}
