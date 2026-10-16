/**
 * Bases de los servicios detrás del gateway. Cada servicio conserva su prefijo: el core vive en
 * `/flights/v1`, identity (la cuenta) en `/identity/v1` y el BFF en `/graphql`.
 */
const CORE_PREFIX = /\/flights\/v1\/*$/;
export const IDENTITY_PREFIX = '/identity/v1';

const withoutTrailingSlash = (url: string) => url.trim().replace(/\/+$/, '');

/**
 * Base de identity (donde van `/auth/register`, `/login`, `/refresh`, `/logout` y `/me`):
 * - API vacía (mock): vacía. La cuenta también es del mock; nunca se mezclan.
 * - `VITE_IDENTITY_URL` con valor: esa, tal cual (sin barras finales).
 * - Si no, se deriva de `VITE_API_URL` cambiando el sufijo `/flights/v1` por `/identity/v1`
 *   (`https://gw/flights/v1` → `https://gw/identity/v1`: así es detrás del gateway).
 * - Si `VITE_API_URL` no termina en `/flights/v1`, no hay de dónde derivarla: la cuenta queda en
 *   `VITE_API_URL` (el login propio del core, `AUTH_MODE=local`). Es lo mismo que poner
 *   `VITE_IDENTITY_URL` igual a `VITE_API_URL`.
 */
export function identityUrlFor(apiUrl: string, identityUrl = ''): string {
  const api = withoutTrailingSlash(apiUrl);
  if (api === '') return '';
  const explicit = withoutTrailingSlash(identityUrl);
  if (explicit !== '') return explicit;
  return CORE_PREFIX.test(api) ? api.replace(CORE_PREFIX, IDENTITY_PREFIX) : api;
}
