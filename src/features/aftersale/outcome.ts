import { isApiError } from '@/shared/api';

/**
 * Qué le pasó a un cobro de postventa (equipaje o cambio de fecha), a partir del error que dio la API:
 *  - `rejected`: 422 PAYMENT_NOT_AUTHORIZED. No se cobró nada: se reintenta con otro pago SIN perder lo elegido.
 *  - `reference`: la referencia no sirve o ya se usó (409/422 PAYMENT_REFERENCE_INVALID): hace falta otra.
 *  - `expired`: la oferta de cambio o la cotización venció (410 CHANGE_OFFER_EXPIRED, 409 QUOTE_EXPIRED): hay que pedirla de nuevo.
 *  - `permission`: 403 (la cuenta no tiene el permiso de esa acción).
 *  - `other`: cualquier otro; se muestra con el mensaje del catálogo.
 */
export type PaymentProblem = 'rejected' | 'reference' | 'expired' | 'permission' | 'other';

export function classifyPaymentError(error: unknown): PaymentProblem {
  if (!isApiError(error)) return 'other';
  if (error.code === 'PAYMENT_NOT_AUTHORIZED') return 'rejected';
  if (error.code === 'PAYMENT_REFERENCE_INVALID') return 'reference';
  if (error.code === 'CHANGE_OFFER_EXPIRED' || error.code === 'QUOTE_EXPIRED') return 'expired';
  if (error.status === 403) return 'permission';
  return 'other';
}
