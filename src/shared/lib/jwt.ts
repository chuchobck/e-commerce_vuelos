/**
 * Lectura del payload de un JWT SIN verificar la firma: el cliente solo necesita saber cuándo
 * vence (`exp`) para renovarlo a tiempo. La firma la verifica siempre el backend.
 */
export interface JwtPayload {
  sub?: string;
  exp?: number;
  iat?: number;
  scope?: string;
}

function base64UrlDecode(part: string): string {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload: unknown = JSON.parse(base64UrlDecode(parts[1]));
    return typeof payload === 'object' && payload !== null ? (payload as JwtPayload) : null;
  } catch {
    return null;
  }
}

/** Vencimiento del token en milisegundos (epoch), o null si no se puede leer. */
export function jwtExpiresAt(token: string): number | null {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1000 : null;
}
