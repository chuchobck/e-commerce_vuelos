/**
 * Cliente HTTP de la API de vuelos: el ÚNICO lugar del frontend que llama a `fetch`.
 *
 * - JSON con `Accept: application/json` y tiempo máximo de 45 s (el arranque en frío de Render
 *   puede tardar cerca de un minuto en la primera petición).
 * - Errores ProblemDetails → ApiError; red caída → NETWORK; tiempo agotado → TIMEOUT.
 * - Reintento: solo lecturas (`retry: true`), una vez, ante error de red, tiempo agotado o 503,
 *   esperando lo que diga Retry-After con un tope de 10 s. Las escrituras nunca se reintentan solas.
 *   El tiempo agotado cuenta porque el arranque en frío de Render (~52 s medidos) supera los 45 s:
 *   al reintentar, el servidor ya despertó.
 * - Si una petición tarda más de 3 s se marca como "servidor despertando" (ver activity.ts).
 * - Deduplicación: dos lecturas idénticas (`retry: true`, mismo método, URL, cuerpo y token) que
 *   coinciden en vuelo comparten la misma promesa. Así el doble montaje de StrictMode o un doble
 *   clic hacen una sola petición. Las escrituras nunca se deduplican.
 * - Cancelación: una lectura puede traer un `AbortSignal` (p. ej. al salir de una pantalla). Al cancelarse
 *   la petición se aborta, lanza ABORTED y nunca se reintenta. Una petición con señal no se deduplica: una
 *   cancelación de quien la pidió no debe tumbar la de otro que comparta la promesa.
 */
import { abortedError, ApiError } from '../errors';
import { serverActivity } from './activity';
import { problemToApiError } from './problem';

const REQUEST_TIMEOUT_MS = 45_000;
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
  /** Petición con sesión: lleva Authorization: Bearer. Las rutas públicas nunca llevan token. */
  auth?: boolean;
  /** Cancela la petición (y su reintento) cuando quien la pidió ya no necesita la respuesta. */
  signal?: AbortSignal;
}

export interface HttpClientOptions {
  baseUrl: string;
  /** Token de acceso vigente; solo se envía en peticiones con `auth: true`. */
  getAccessToken?: () => string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  slowAfterMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Registro técnico para desarrollo (nunca se muestra al usuario). */
  log?: (message: string, detail?: unknown) => void;
}

/** Respuesta correcta con su código HTTP: la postventa distingue 200/201 (hecho) de 202 (en proceso). */
export interface HttpResult<T> {
  status: number;
  /** `undefined` si la respuesta no trae cuerpo (p. ej. un 202 vacío o un 204). */
  body: T | undefined;
}

export interface HttpClient {
  request<T>(method: string, path: string, options?: RequestOptions): Promise<T>;
  /** Como `request`, pero devuelve también el código HTTP. Mismas reglas de reintento y errores. */
  requestWithStatus<T>(method: string, path: string, options?: RequestOptions): Promise<HttpResult<T>>;
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

  async function attempt<T>(method: string, path: string, options: RequestOptions): Promise<HttpResult<T>> {
    const url = new URL(`${base}${path}`);
    for (const [k, v] of Object.entries(options.query ?? {})) url.searchParams.set(k, v);

    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.auth) {
      const token = getAccessToken?.();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const unmarkSlow = options.silent ? undefined : startSlowWatch();
    const cancelled = () => options.signal?.aborted === true;
    const relay = () => controller.abort();
    if (cancelled()) relay();
    options.signal?.addEventListener('abort', relay, { once: true });

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch (error) {
      if (cancelled()) throw abortedError();
      const timedOut = controller.signal.aborted;
      log(`[api] ${method} ${path}: ${timedOut ? 'tiempo agotado' : 'sin conexión'}`, error);
      throw new ApiError({ status: 0, code: timedOut ? 'TIMEOUT' : 'NETWORK', detail: String(error) });
    } finally {
      clearTimeout(timer);
      unmarkSlow?.();
      options.signal?.removeEventListener('abort', relay);
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      if (cancelled()) throw abortedError();
      throw new ApiError({ status: 0, code: 'NETWORK', detail: String(error) });
    }
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
    return { status: response.status, body: body as T | undefined };
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

  async function withRetry<T>(method: string, path: string, options: RequestOptions): Promise<HttpResult<T>> {
    try {
      return await attempt<T>(method, path, options);
    } catch (error) {
      const retryable =
        error instanceof ApiError && (error.code === 'NETWORK' || error.code === 'TIMEOUT' || error.status === 503);
      if (!options.retry || !retryable) throw error;
      const waitS = Math.min(error.retryAfter ?? DEFAULT_RETRY_WAIT_S, MAX_RETRY_WAIT_S);
      await sleep(waitS * 1000);
      // Si se canceló durante la espera, no se vuelve a pedir.
      if (options.signal?.aborted) throw abortedError();
      return attempt<T>(method, path, options);
    }
  }

  const inflight = new Map<string, Promise<unknown>>();

  function send<T>(method: string, path: string, options: RequestOptions): Promise<HttpResult<T>> {
    if (!options.retry || options.signal) return withRetry<T>(method, path, options);
    const key = JSON.stringify([
      method,
      path,
      options.query ?? null,
      options.body ?? null,
      options.auth ? (getAccessToken?.() ?? null) : null,
    ]);
    const pending = inflight.get(key);
    if (pending) return pending as Promise<HttpResult<T>>;
    const promise = withRetry<T>(method, path, options).finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
  }

  return {
    async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
      return (await send<T>(method, path, options)).body as T;
    },
    requestWithStatus<T>(method: string, path: string, options: RequestOptions = {}): Promise<HttpResult<T>> {
      return send<T>(method, path, options);
    },
  };
}
