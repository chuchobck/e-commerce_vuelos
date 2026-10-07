import { es } from '@/shared/i18n';

export type ApiErrorCode =
  | 'NETWORK'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'HOLD_EXPIRED'
  | 'FARE_UNAVAILABLE'
  | 'SEAT_TAKEN'
  | 'VALIDATION'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_TAKEN'
  | 'CHECKIN_WINDOW'
  | 'SERVICE_UNAVAILABLE'
  | 'UNKNOWN';

export interface FieldError {
  field: string;
  message: string;
}

/** Error normalizado que lanza cualquier implementación de FlightsApi. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fieldErrors: FieldError[];

  constructor(status: number, code: ApiErrorCode, message?: string, fieldErrors: FieldError[] = []) {
    super(message ?? code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** Mensaje en lenguaje del usuario: qué pasó y qué hacer. */
export function errorMessage(error: unknown): string {
  if (!isApiError(error)) return es.errors.unknown;
  if (error.code === 'INVALID_CREDENTIALS') return es.auth.invalidCredentials;
  if (error.code === 'EMAIL_TAKEN') return es.auth.emailTaken;
  if (error.code === 'HOLD_EXPIRED') return es.purchase.holdExpiredText;
  if (error.code === 'CHECKIN_WINDOW' && error.message) return error.message;
  switch (error.status) {
    case 0:
      return es.errors.network;
    case 401:
      return es.errors.unauthorized401;
    case 404:
      return es.errors.notFound404;
    case 409:
      return es.errors.conflict409;
    case 422:
      return es.errors.validation422;
    case 503:
      return es.errors.unavailable503;
    default:
      return es.errors.unknown;
  }
}
