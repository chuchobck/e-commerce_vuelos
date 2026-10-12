import { es, fmt } from '@/shared/i18n';
import type { ProblemCode } from './contract';

/**
 * Códigos que no vienen del contrato: fallas de transporte y el 409 genérico de los errores
 * simulados del mock. Los errores de cuenta (/auth/*) no tienen
 * código propio: la API manda VALIDATION_FAILED y el status dice qué pasó (ver authErrorMessage).
 */
export type LocalErrorCode = 'NETWORK' | 'TIMEOUT' | 'ABORTED' | 'NOT_CONNECTED' | 'CONFLICT' | 'SERVICE_UNAVAILABLE';

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

/** El error de una petición que canceló quien la pidió. */
export function abortedError(): ApiError {
  return new ApiError({ status: 0, code: 'ABORTED', detail: 'cancelada por quien la pidió' });
}

/** La petición la canceló quien la pidió (`AbortSignal`): no es una falla ni se avisa al usuario. */
export function isAbortError(error: unknown): boolean {
  return isApiError(error) && error.code === 'ABORTED';
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
    case 'ABORTED':
      // La cancela quien pidió la respuesta: no se le muestra a nadie. Queda el genérico por si se llegara a mostrar.
      return e.unknown;
    case 'CHECK_IN_NOT_AVAILABLE':
      return e.checkInNotAvailable;
    case 'CHECK_IN_FAILED':
      return e.checkInFailed;
    case 'BOARDING_PASS_NOT_AVAILABLE':
      return e.boardingPassNotAvailable;
    case 'OFFER_NO_LONGER_AVAILABLE':
      return e.offerGone;
    case 'BAGGAGE_LIMIT_EXCEEDED':
      return e.baggageLimit;
    case 'FARE_NOT_CHANGEABLE':
      return e.fareNotChangeable;
    case 'CHANGE_OFFER_EXPIRED':
      return e.changeOfferExpired;
    case 'QUOTE_EXPIRED':
      return e.quoteExpired;
    case 'ALREADY_CANCELLED':
      return e.alreadyCancelled;
    case 'CUTOFF_PASSED':
      return e.cutoffPassed;
    case 'FLIGHT_ALREADY_DEPARTED':
      return e.flightDeparted;
    case 'PAYMENT_NOT_AUTHORIZED':
      return e.paymentNotAuthorized;
    case 'PAYMENT_REFERENCE_INVALID':
      return e.paymentReferenceInvalid;
    case 'BOOKING_NOT_CONFIRMED':
      return e.bookingNotConfirmed;
    default:
      break;
  }
  // El backend rotula como VALIDATION_FAILED casi todo error sin código propio (leído en su código): se distingue por el
  // estado y por el parámetro. Una oferta de cambio o una cotización vencida hace rato ya no existe (422 con su id); un 409
  // genérico en la postventa es una reserva que ya no está confirmada, un trámite en proceso o una oferta ya usada.
  if (error.status === 422 && error.fieldErrors.some(({ field }) => field === 'changeOfferId')) return e.changeOfferExpired;
  if (error.status === 422 && error.fieldErrors.some(({ field }) => field === 'quoteId')) return e.quoteExpired;
  if (error.status === 409 && error.code === 'VALIDATION_FAILED') return e.bookingStateChanged;
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

export type AuthAction = 'login' | 'register';

/**
 * Mensaje para un error de ingreso o registro. 401 al ingresar es genérico (no revela si el correo
 * existe); 409 al registrar = correo ya registrado; 429 trae el tiempo de Retry-After si viene.
 */
export function authErrorMessage(error: unknown, action: AuthAction): string {
  if (!isApiError(error)) return e.unknown;
  if (action === 'login' && error.status === 401) return es.auth.invalidCredentials;
  if (action === 'register' && error.status === 409) return es.auth.emailTaken;
  if (error.status === 429) {
    return error.retryAfter ? fmt(es.auth.tooManyAttempts, { seconds: error.retryAfter }) : es.auth.tooManyAttemptsNoTime;
  }
  if (error.status === 400) return es.auth.invalidData;
  return errorMessage(error);
}

/** Errores por campo de un 400 de /auth/* (correo o contraseña), en español. */
export function authFieldErrors(error: unknown): { email?: string; password?: string } {
  if (!isApiError(error) || error.status !== 400) return {};
  const out: { email?: string; password?: string } = {};
  for (const { field, message } of error.fieldErrors) {
    if (/email/i.test(field)) out.email ??= es.validation.emailInvalid;
    if (/password/i.test(field)) out.password ??= /shorter|max/i.test(message) ? es.validation.passwordMax : es.validation.passwordLength;
  }
  return out;
}
