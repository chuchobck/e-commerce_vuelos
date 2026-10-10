import { apiConfig } from '../config';
import { abortedError, ApiError, type ApiErrorCode } from '../errors';

/** Estados de error que el mock puede simular para diseñar los estados de la interfaz. */
export type SimulatedStatus = 403 | 409 | 422 | 429 | 503;

const FORCE_KEY = 'quinde.mock.forceError';

const CODES: Record<SimulatedStatus, ApiErrorCode> = {
  403: 'VALIDATION_FAILED',
  409: 'CONFLICT',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMIT_EXCEEDED',
  503: 'SERVICE_UNAVAILABLE',
};

/** Espera entre 300 y 800 ms (más `extraMs`) para simular la red. Con una señal cancelada se corta y lanza ABORTED. */
function latency(min = 300, max = 800, signal?: AbortSignal, extraMs = 0): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min + extraMs;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortedError());
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
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

export function simulated(status: SimulatedStatus, operation: string) {
  // 429 y 503 llegan con Retry-After, como en la API.
  const retryAfter = status === 429 ? 10 : status === 503 ? 5 : undefined;
  return new ApiError({ status, code: CODES[status], detail: `Error simulado (${operation})`, retryAfter });
}

/** Lanza ocasionalmente uno de los errores permitidos para la operación. */
function maybeFail(operation: string, allowed: SimulatedStatus[]): void {
  const forced = forcedStatus(operation);
  if (forced) throw simulated(forced, operation);
  if (allowed.length === 0 || Math.random() >= apiConfig.mockErrorRate) return;
  const status = allowed[Math.floor(Math.random() * allowed.length)];
  throw simulated(status, operation);
}

export interface SimulateOptions {
  /** Con una señal, cancelarla corta la espera (ABORTED). */
  signal?: AbortSignal;
  /** `false`: sin errores aleatorios (los forzados con `setForcedError` siguen aplicando). Para peticiones que nadie espera en pantalla. */
  randomErrors?: boolean;
  /** Espera adicional, para simular un servidor lento (el arranque en frío de Render tarda ~50 s). */
  extraDelayMs?: number;
}

/**
 * Simula red: latencia + error ocasional. Cada llamada deja una marca `mock:<operación>` en `performance`, así quien mide
 * (una prueba, el panel de red de Chrome) puede contar cuántas peticiones hizo una pantalla.
 */
export async function simulate(operation: string, allowed: SimulatedStatus[], { signal, randomErrors = true, extraDelayMs = 0 }: SimulateOptions = {}): Promise<void> {
  try {
    performance.mark(`mock:${operation}`);
  } catch {
    /* sin Performance API */
  }
  await latency(300, 800, signal, extraDelayMs);
  maybeFail(operation, randomErrors ? allowed : []);
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
  'getTickets',
  'getTicket',
  'getBaggageOptions',
  'addBaggage',
  'searchDateChange',
  'confirmDateChange',
  'getCancellationQuote',
  'getBooking',
  'cancelBooking',
  'checkIn',
  'getBoardingPasses',
  'getFlightStatus',
  'login',
  'register',
  'refresh',
  'logout',
  'me',
] as const;

export const SIMULATED_STATUSES: SimulatedStatus[] = [403, 409, 422, 429, 503];

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
