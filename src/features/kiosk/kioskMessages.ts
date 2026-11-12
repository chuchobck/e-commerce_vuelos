import { errorMessage, isApiError } from '@/shared/api';
import { es } from '@/shared/i18n';

const t = es.kiosk.errors;

/** Código que da la API cuando el token del kiosko venció o no es válido. */
export const KIOSK_SESSION_INVALID = 'KIOSK_SESSION_INVALID';

/** El token del kiosko ya no sirve: se borra todo y se vuelve al paso 1. */
export function isKioskSessionExpired(error: unknown): boolean {
  return isApiError(error) && error.status === 401 && (error.code as string | undefined) === KIOSK_SESSION_INVALID;
}

/**
 * Mensaje del kiosko. Un 404 dice siempre lo mismo (no revela si falló el código o el apellido) y nunca se muestra el `detail`.
 * Lo demás reutiliza el mapeo general de errores.
 */
export function kioskErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (isKioskSessionExpired(error)) return t.sessionExpired;
    if (error.status === 404) return t.notFound;
    if (error.status === 409 && (error.code as string | undefined) === 'CHECK_IN_NOT_AVAILABLE') return t.checkInNotAvailable;
    if (error.status === 429) return t.rateLimited;
  }
  return errorMessage(error);
}
