import type { ProblemDetailsDto } from '../contract';
import { ApiError, type ApiErrorCode } from '../errors';

/** Retry-After en segundos: acepta segundos ("12") o una fecha HTTP. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

function isProblem(body: unknown): body is Partial<ProblemDetailsDto> {
  return typeof body === 'object' && body !== null && ('status' in body || 'title' in body || 'code' in body);
}

/** Respuesta de error (ProblemDetails, RFC 9457) → ApiError. Tolera cuerpos vacíos o no JSON. */
export function problemToApiError(status: number, body: unknown, retryAfterHeader: string | null): ApiError {
  const problem = isProblem(body) ? body : {};
  return new ApiError({
    status,
    code: problem.code as ApiErrorCode | undefined,
    title: problem.title,
    detail: problem.detail,
    fieldErrors: (problem.invalidParams ?? []).map((p) => ({ field: p.name ?? '', message: p.reason ?? '' })),
    retryAfter: parseRetryAfter(retryAfterHeader),
  });
}
