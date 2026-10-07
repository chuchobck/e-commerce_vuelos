/**
 * Tokens del mock con las mismas reglas que la API (src/modules/auth del backend):
 * JWT de acceso de 15 minutos y refresh token opaco de 43 caracteres, 7 días, que rota en cada uso.
 * El JWT del mock no va firmado (alg "none"): sirve para que la sesión lea `exp` igual que con la API.
 */
import { decodeJwtPayload } from '@/shared/lib/jwt';
import { ApiError } from '../errors';

/** Scopes del rol "cliente" en la API (los decide el backend; el frontend nunca envía un rol). */
export const CLIENT_SCOPES = ['flights:read', 'flights:hold', 'flights:book', 'flights:cancel', 'flights:webhooks'] as const;

export const ACCESS_TOKEN_SECONDS = 15 * 60;
export const REFRESH_TOKEN_SECONDS = 7 * 24 * 60 * 60;
const ISSUER = 'quinde-mock';

function base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function issueAccessToken(userId: string, scopes: readonly string[], now = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = base64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({ sub: userId, scope: scopes.join(' '), iat, exp: iat + ACCESS_TOKEN_SECONDS, iss: ISSUER, jti: crypto.randomUUID() }),
  );
  return `${header}.${payload}.mock`;
}

/** Id del usuario de un token de acceso vigente emitido por el mock, o null. */
export function userIdFromAccessToken(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const payload = decodeJwtPayload(token) as { sub?: string; exp?: number; iss?: string } | null;
  if (!payload || payload.iss !== ISSUER || typeof payload.exp !== 'number' || !payload.sub) return null;
  return payload.exp * 1000 > now ? payload.sub : null;
}

/** 32 bytes aleatorios en base64url = 43 caracteres, el mismo formato que la API. */
export function newRefreshToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Como la API: todo 401 lleva VALIDATION_FAILED y el status dice qué pasó. */
export function unauthorized(detail: string): ApiError {
  return new ApiError({ status: 401, code: 'VALIDATION_FAILED', title: 'Unauthorized', detail });
}

export function badRequest(field: string, reason: string): ApiError {
  return new ApiError({ status: 400, code: 'VALIDATION_FAILED', title: 'Bad Request', detail: `${field}: ${reason}`, fieldErrors: [{ field, message: reason }] });
}
