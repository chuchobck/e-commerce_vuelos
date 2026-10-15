/**
 * Cliente GraphQL mínimo para las tres lecturas públicas del BFF (Reto 2). Es un solo `POST` con
 * `fetch`: sin Apollo, urql ni graphql-request. Vive junto al cliente REST, que es el otro lugar
 * permitido para llamar a `fetch`.
 *
 * - Cabeceras: `Content-Type`, `X-Request-Id` (un uuid por petición) y las que pida quien llama
 *   (`X-Device-Fingerprint` solo en la búsqueda). Nada más: el CORS del BFF solo admite esas tres.
 *   Nunca `Authorization`: estas lecturas son públicas.
 * - Tiempo máximo de 45 s y cancelación con `AbortSignal` (ABORTED, nunca se reintenta).
 * - Reintento igual al de las lecturas REST: una vez, ante red caída, tiempo agotado (también
 *   GATEWAY_TIMEOUT) o SERVICE_UNAVAILABLE, esperando `retryAfter` con tope de 10 s.
 * - HTTP 200 con `errors` es un error (GraphQL lo manda así); el 429 trae `Retry-After`.
 * - `extensions.requestId` solo va al registro de desarrollo, nunca a la pantalla.
 */
import { abortedError, ApiError } from '../errors';
import { watchSlow } from './activity';
import { DEFAULT_RETRY_WAIT_S, MAX_RETRY_WAIT_S, REQUEST_TIMEOUT_MS, SLOW_AFTER_MS } from './client';
import { graphqlErrorToApiError, type GraphqlErrorItem } from './graphqlErrors';

export interface GraphqlRequest {
  query: string;
  /** Siempre variables tipadas: la consulta nunca se arma con texto interpolado. */
  variables?: Record<string, unknown>;
  operationName?: string;
  /** Única cabecera extra permitida: `X-Device-Fingerprint`, y solo en la búsqueda. */
  headers?: { 'X-Device-Fingerprint'?: string };
  /** Lectura reintentable una vez. Por defecto sí; `false` la envía una sola vez. */
  retry?: boolean;
  signal?: AbortSignal;
}

export interface GraphqlClient {
  /** Devuelve `data` o lanza el ApiError que corresponda. */
  request<T>(request: GraphqlRequest): Promise<T>;
}

export interface GraphqlClientOptions {
  /** URL completa del endpoint, p. ej. http://localhost:4000/graphql. */
  url: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  slowAfterMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Un id por petición (X-Request-Id). Por defecto un uuid. */
  requestId?: () => string;
  /** Registro técnico para desarrollo (nunca se muestra al usuario). */
  log?: (message: string, detail?: unknown) => void;
}

interface GraphqlBody {
  data?: unknown;
  errors?: GraphqlErrorItem[];
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `crypto.randomUUID` solo existe en contextos seguros (https o localhost): respaldo con getRandomValues. */
export function newRequestId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isBody(value: unknown): value is GraphqlBody {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createGraphqlClient({
  url,
  fetchImpl = (...args) => globalThis.fetch(...args),
  timeoutMs = REQUEST_TIMEOUT_MS,
  slowAfterMs = SLOW_AFTER_MS,
  sleep = defaultSleep,
  requestId = newRequestId,
  log = () => undefined,
}: GraphqlClientOptions): GraphqlClient {
  const label = (request: GraphqlRequest) => `[graphql] ${request.operationName ?? 'operación'}`;

  async function attempt<T>(request: GraphqlRequest): Promise<T> {
    const headers: Record<string, string> = {
      ...request.headers,
      'Content-Type': 'application/json',
      'X-Request-Id': requestId(),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const unmarkSlow = watchSlow(slowAfterMs);
    const cancelled = () => request.signal?.aborted === true;
    const relay = () => controller.abort();
    if (cancelled()) relay();
    request.signal?.addEventListener('abort', relay, { once: true });

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: request.query, variables: request.variables, operationName: request.operationName }),
        signal: controller.signal,
      });
    } catch (error) {
      if (cancelled()) throw abortedError();
      const timedOut = controller.signal.aborted;
      log(`${label(request)}: ${timedOut ? 'tiempo agotado' : 'sin conexión'}`, error);
      throw new ApiError({ status: 0, code: timedOut ? 'TIMEOUT' : 'NETWORK', detail: String(error) });
    } finally {
      clearTimeout(timer);
      unmarkSlow();
      request.signal?.removeEventListener('abort', relay);
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      if (cancelled()) throw abortedError();
      throw new ApiError({ status: 0, code: 'NETWORK', detail: String(error) });
    }
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    const body = isBody(parsed) ? parsed : undefined;

    // Con `errors` (aunque el HTTP sea 200, o 400/429 del BFF) manda el primero: es el que decide el cliente.
    const first = Array.isArray(body?.errors) ? body.errors[0] : undefined;
    if (first) {
      const error = graphqlErrorToApiError(first, response.headers.get('Retry-After'));
      log(`${label(request)}: ${first.extensions?.code ?? response.status} (requestId ${first.extensions?.requestId ?? headers['X-Request-Id']})`, first);
      throw error;
    }
    if (!response.ok) {
      // Sin cuerpo GraphQL (p. ej. un 429 de un proxy): se decide por el estado HTTP.
      const retryAfter = Number(response.headers.get('Retry-After'));
      log(`${label(request)}: HTTP ${response.status}`, text);
      throw new ApiError({ status: response.status, retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined });
    }
    if (!body || body.data === undefined || body.data === null) {
      log(`${label(request)}: respuesta sin data`, text);
      throw new ApiError({ status: 500, detail: 'respuesta GraphQL sin data' });
    }
    return body.data as T;
  }

  async function withRetry<T>(request: GraphqlRequest): Promise<T> {
    try {
      return await attempt<T>(request);
    } catch (error) {
      const retryable =
        error instanceof ApiError && (error.code === 'NETWORK' || error.code === 'TIMEOUT' || error.status === 503);
      if ((request.retry ?? true) === false || !retryable) throw error;
      const waitS = Math.min(error.retryAfter ?? DEFAULT_RETRY_WAIT_S, MAX_RETRY_WAIT_S);
      await sleep(waitS * 1000);
      // Si se canceló durante la espera, no se vuelve a pedir.
      if (request.signal?.aborted) throw abortedError();
      return attempt<T>(request);
    }
  }

  // Dos lecturas idénticas en vuelo (StrictMode, doble clic) comparten una sola petición; con señal, nunca.
  const inflight = new Map<string, Promise<unknown>>();

  return {
    request<T>(request: GraphqlRequest): Promise<T> {
      if ((request.retry ?? true) === false || request.signal) return withRetry<T>(request);
      const key = JSON.stringify([request.query, request.variables ?? null, request.headers ?? null]);
      const pending = inflight.get(key);
      if (pending) return pending as Promise<T>;
      const promise = withRetry<T>(request).finally(() => inflight.delete(key));
      inflight.set(key, promise);
      return promise;
    },
  };
}
