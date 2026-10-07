import { es, fmt } from '@/shared/i18n';
import type { ProblemCode } from './contract';

/**
 * Códigos que no vienen del contrato: fallas de transporte y los del mock que aún no tienen
 * equivalente en la API (sesión y compra se conectan en F3 y F4).
 */
export type LocalErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'NOT_CONNECTED'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_TAKEN'
  | 'HOLD_EXPIRED'
  | 'CONFLICT'
  | 'SERVICE_UNAVAILABLE';

export type ApiErrorCode = ProblemCode | LocalErrorCode;

export interface FieldError {
  /** Nombre del parámetro tal como lo da la API (p. ej. "itineraries[0].departureDate"). */
  field: string;
  /** Motivo técnico en inglés: nunca se muestra tal cual. */
  message: string;
}

export interface ApiErrorInit {
  /** HTTP status; 0 para errores de red o tiempo agotado. */
  status: number;
  code?: ApiErrorCode;
  title?: string;
  /** Detalle técnico de la API (en inglés). Solo para la consola de desarrollo. */
  detail?: string;
  fieldErrors?: FieldError[];
  /** Segundos de espera de la cabecera Retry-After. */
  retryAfter?: number;
}

/** Error normalizado que lanza cualquier implementación de FlightsApi (ProblemDetails, RFC 9457). */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: ApiErrorCode;
  readonly title?: string;
  readonly detail?: string;
  readonly fieldErrors: FieldError[];
  readonly retryAfter?: number;

  constructor({ status, code, title, detail, fieldErrors = [], retryAfter }: ApiErrorInit) {
    super(detail ?? title ?? code ?? `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.title = title;
    this.detail = detail;
    this.fieldErrors = fieldErrors;
    this.retryAfter = retryAfter;
  }
}

/** Operación que existe en el contrato pero que esta versión del frontend aún no conecta con la API real. */
export class NotYetConnectedError extends ApiError {
  constructor(operation: string) {
    super({ status: 0, code: 'NOT_CONNECTED', detail: `${operation} se conecta en una fase posterior` });
    this.name = 'NotYetConnectedError';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

const e = es.errors;

/**
 * Mensaje en lenguaje del usuario: qué pasó y qué hacer. Nunca devuelve el `detail` de la API.
 */
export function errorMessage(error: unknown): string {
  if (!isApiError(error)) return e.unknown;
  switch (error.code) {
    case 'NOT_CONNECTED':
      return e.notConnected;
    case 'TIMEOUT':
      return e.timeout;
    case 'NETWORK':
      return e.network;
    case 'INVALID_CREDENTIALS':
      return es.auth.invalidCredentials;
    case 'EMAIL_TAKEN':
      return es.auth.emailTaken;
    case 'HOLD_EXPIRED':
      return es.purchase.holdExpiredText;
    case 'CHECK_IN_NOT_AVAILABLE':
      return e.checkInNotAvailable;
    case 'OFFER_NO_LONGER_AVAILABLE':
      return e.offerGone;
    default:
      break;
  }
  if (error.status === 429) return error.retryAfter ? fmt(e.rateLimited, { seconds: error.retryAfter }) : e.rateLimitedNoTime;
  if (error.status === 0) return e.network;
  if (error.status === 400) return e.badRequest400;
  if (error.status === 401) return e.unauthorized401;
  if (error.status === 403) return e.forbidden403;
  if (error.status === 404) return e.notFound404;
  if (error.status === 409) return e.conflict409;
  if (error.status === 422) return e.validation422;
  if (error.status === 503) return error.retryAfter ? fmt(e.unavailable503Wait, { seconds: error.retryAfter }) : e.unavailable503;
  if (error.status >= 500) return e.server5xx;
  return e.unknown;
}

/** Mensaje en español para un campo inválido de la búsqueda (400 con invalidParams). */
export function fieldErrorMessage({ field, message }: FieldError): string {
  const f = es.errors.fields;
  if (/departureDate/.test(field)) return /past/.test(message) ? f.datePast : f.date;
  if (/itineraries\[\d+\]\.(origin|destination)/.test(field)) return f.airport;
  if (/passengers\.infants/.test(field)) return es.validation.infantsPerAdult;
  if (/passengers/.test(field)) return es.validation.maxPassengers;
  return f.other;
}
