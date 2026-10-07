/**
 * Cliente HTTP de la API de vuelos: el ÚNICO lugar del frontend que llama a `fetch`.
 *
 * - JSON con `Accept: application/json` y tiempo máximo de 45 s (el arranque en frío de Render
 *   puede tardar cerca de un minuto en la primera petición).
 * - Errores ProblemDetails → ApiError; red caída → NETWORK; tiempo agotado → TIMEOUT.
 * - Reintento: solo lecturas (`retry: true`), una vez, ante error de red o 503, esperando lo que
 *   diga Retry-After con un tope de 10 s. Las escrituras nunca se reintentan solas.
 * - Si una petición tarda más de 3 s se marca como "servidor despertando" (ver activity.ts).
 */
import { ApiError } from '../errors';
import { serverActivity } from './activity';
import { problemToApiError } from './problem';

export const REQUEST_TIMEOUT_MS = 45_000;
export const SLOW_AFTER_MS = 3_000;
export const MAX_RETRY_WAIT_S = 10;
const DEFAULT_RETRY_WAIT_S = 1;

export interface RequestOptions {
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  /** Solo para lecturas: un reintento ante red caída o 503. */
  retry?: boolean;
  /** No cuenta para el aviso de "servidor despertando" (p. ej. el ping de salud). */
  silent?: boolean;
}

export interface HttpClientOptions {
  baseUrl: string;
  /** Punto de inyección del token de acceso (se conecta en F3). */
  getAccessToken?: () => string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  slowAfterMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Registro técnico para desarrollo (nunca se muestra al usuario). */
  log?: (message: string, detail?: unknown) => void;
}

export interface HttpClient {
  request<T>(method: string, path: string, options?: RequestOptions): Promise<T>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createHttpClient({
  baseUrl,
  getAccessToken,
  fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = REQUEST_TIMEOUT_MS,
  slowAfterMs = SLOW_AFTER_MS,
  sleep = defaultSleep,
  log = () => undefined,
}: HttpClientOptions): HttpClient {
  const base = baseUrl.replace(/\/+$/, '');

  async function attempt<T>(method: string, path: string, options: RequestOptions): Promise<T> {
    const url = new URL(`${base}${path}`);
    for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);

    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getAccessToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const unmarkSlow = options.silent ? undefined : startSlowWatch();

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = controller.signal.aborted;
      log(`[api] ${method} ${path}: ${timedOut ? 'tiempo agotado' : 'sin conexión'}`, error);
      throw new ApiError({ status: 0, code: timedOut ? 'TIMEOUT' : 'NETWORK', detail: String(error) });
    } finally {
      clearTimeout(timer);
      unmarkSlow?.();
    }

    const text = await response.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      const error = problemToApiError(response.status, body, response.headers.get('Retry-After'));
      log(`[api] ${method} ${path}: ${response.status} ${error.code ?? ''} ${error.detail ?? ''}`, body);
      throw error;
    }
    return body as T;
  }

  function startSlowWatch() {
    let unmark: (() => void) | undefined;
    const timer = setTimeout(() => {
      unmark = serverActivity.markSlow();
    }, slowAfterMs);
    return () => {
      clearTimeout(timer);
      unmark?.();
    };
  }

  return {
    async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
      try {
        return await attempt<T>(method, path, options);
      } catch (error) {
        const retryable = error instanceof ApiError && (error.code === 'NETWORK' || error.status === 503);
        if (!options.retry || !retryable) throw error;
        const waitS = Math.min(error.retryAfter ?? DEFAULT_RETRY_WAIT_S, MAX_RETRY_WAIT_S);
        await sleep(waitS * 1000);
        return attempt<T>(method, path, options);
      }
    },
  };
}
