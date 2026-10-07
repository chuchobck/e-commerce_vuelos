/**
 * Máquina de la compra: estados, eventos y transiciones como funciones PURAS (sin React, sin red).
 * flow.ts ejecuta los efectos (API, almacenamiento, temporizadores) y le pasa los eventos.
 *
 *   sin selección → selección guardada → (con sesión) creando hold → hold activo
 *     → datos de pasajeros completos → pagando
 *     → confirmada | en proceso | pago rechazado | hold vencido | error
 */
import { isApiError, type ApiError, type Booking, type FieldError, type Hold } from '@/shared/api';

/** Por qué el hold ya no sirve. */
export type HoldEnd = 'expired' | 'released' | 'consumed' | 'missing';

/** Por qué no se pudo pagar con un pago "rechazado" (el hold sigue vivo). */
export type PaymentProblem = 'declined' | 'invalid-reference';

export type CheckoutState =
  /** No hay selección del paso 1. */
  | { step: 'empty' }
  /** Hay selección; falta la sesión para apartar el precio. */
  | { step: 'selected' }
  /** Creando el hold o verificando el guardado. */
  | { step: 'holding' }
  /** Hold activo. `passengersReady`: los datos de pasajeros están completos. */
  | {
      step: 'held';
      hold: Hold;
      passengersReady: boolean;
      passengerErrors: FieldError[];
      /**
       * Asiento ocupado (409 SEAT_TAKEN) o de otra cabina (422 SEAT_CABIN_MISMATCH) al reservar. La API no
       * dice qué asiento falló: el selector lo averigua con un mapa nuevo. Se limpia al volver a continuar.
       */
      bookingError?: ApiError;
    }
  | { step: 'paying'; hold: Hold }
  | { step: 'confirmed'; booking: Booking }
  /** 202: el pago o la emisión siguen en curso. `gaveUp`: se dejó de consultar (ver polling.ts). */
  | { step: 'processing'; booking: Booking; gaveUp: boolean }
  /** La reserva quedó FAILED (el pago se rechazó después o la emisión no pudo hacerse). */
  | { step: 'failed'; booking: Booking }
  /** El pago no se autorizó; el hold sigue vivo y se puede pagar otra vez. */
  | { step: 'rejected'; hold: Hold; problem: PaymentProblem }
  | { step: 'expired'; reason: HoldEnd }
  /** No se pudo apartar (409 sin cupo o con la oferta vencida, 422): hay que elegir otro vuelo. */
  | { step: 'unavailable'; error: ApiError }
  /** Error que se puede reintentar (red, tiempo agotado, 503, 429…). */
  | { step: 'error'; error: unknown; during: 'hold' | 'payment'; hold?: Hold };

export type CheckoutEvent =
  | { type: 'NO_SELECTION' }
  | { type: 'SIGNED_OUT' }
  | { type: 'HOLD_START' }
  | { type: 'HOLD_READY'; hold: Hold; now: number }
  | { type: 'HOLD_FAILED'; error: unknown }
  | { type: 'HOLD_SYNC'; hold: Hold; now: number }
  | { type: 'TIME_UP' }
  | { type: 'PASSENGERS'; ready: boolean }
  | { type: 'PAY_START' }
  | { type: 'BOOKED'; booking: Booking }
  | { type: 'PAY_FAILED'; error: unknown }
  | { type: 'POLL_GAVE_UP' };

export const initialState: CheckoutState = { step: 'empty' };

/** Estado del hold que dio el servidor → fin del hold, o null si sigue vivo. */
function endOf(hold: Hold, now: number): HoldEnd | null {
  switch (hold.status) {
    case 'RELEASED':
      return 'released';
    case 'CONSUMED':
      return 'consumed';
    case 'EXPIRED':
      return 'expired';
    default:
      return hold.receivedAt + hold.remainingSeconds * 1000 > now ? null : 'expired';
  }
}

/** El hold que tiene el estado actual (si tiene uno). */
export function holdOf(state: CheckoutState): Hold | null {
  return 'hold' in state && state.hold ? state.hold : null;
}

const isPassengerField = (e: FieldError) => /^passengers(\[|$)/.test(e.field);

/** Error al crear o verificar el hold. */
export function classifyHoldError(error: unknown): CheckoutState {
  if (isApiError(error)) {
    if (error.status === 409 || error.status === 422) return { step: 'unavailable', error };
    if (error.status === 404) return { step: 'expired', reason: 'missing' };
    if (error.status === 410) return { step: 'expired', reason: 'expired' };
  }
  return { step: 'error', error, during: 'hold' };
}

/**
 * Error al pagar (POST /bookings), con lo que respondió la API real (README, sección 6).
 * `hold` es el hold con el que se intentó: sigue vivo en un rechazo y en los errores reintentables.
 */
export function classifyPaymentError(error: unknown, hold: Hold): CheckoutState {
  if (isApiError(error)) {
    if (error.code === 'PAYMENT_NOT_AUTHORIZED') return { step: 'rejected', hold, problem: 'declined' };
    if (error.code === 'PAYMENT_REFERENCE_INVALID') return { step: 'rejected', hold, problem: 'invalid-reference' };
    if (error.status === 410) return { step: 'expired', reason: 'expired' };
    // Hold ya usado (otra pestaña o un intento anterior que sí llegó) o inexistente.
    if (error.status === 409 && error.code === 'OFFER_NO_LONGER_AVAILABLE') return { step: 'expired', reason: 'consumed' };
    if (error.status === 422 && error.fieldErrors.some((e) => e.field === 'holdId')) return { step: 'expired', reason: 'missing' };
    // Asientos: se vuelve a los datos y el selector revisa lo elegido contra un mapa nuevo (el hold sigue vivo).
    if (error.code === 'SEAT_TAKEN' || error.code === 'SEAT_CABIN_MISMATCH') {
      return { step: 'held', hold, passengersReady: false, passengerErrors: [], bookingError: error };
    }
    if (error.code === 'INFANT_SEAT_NOT_ALLOWED') {
      return { step: 'held', hold, passengersReady: false, passengerErrors: error.fieldErrors };
    }
    if ((error.status === 400 || error.status === 422) && error.fieldErrors.some(isPassengerField)) {
      return { step: 'held', hold, passengersReady: false, passengerErrors: error.fieldErrors.filter(isPassengerField) };
    }
  }
  return { step: 'error', error, during: 'payment', hold };
}

/** Resultado de POST /bookings o de una consulta posterior. */
export function bookingResult(booking: Booking): CheckoutState {
  if (booking.status === 'CONFIRMED') return { step: 'confirmed', booking };
  if (booking.status === 'FAILED') return { step: 'failed', booking };
  return { step: 'processing', booking, gaveUp: false };
}

export function reduce(state: CheckoutState, event: CheckoutEvent): CheckoutState {
  switch (event.type) {
    case 'NO_SELECTION':
      return { step: 'empty' };
    case 'SIGNED_OUT':
      return { step: 'selected' };
    case 'HOLD_START':
      return { step: 'holding' };
    case 'HOLD_READY': {
      const end = endOf(event.hold, event.now);
      if (end) return { step: 'expired', reason: end };
      const ready = state.step === 'held' ? state.passengersReady : false;
      return { step: 'held', hold: event.hold, passengersReady: ready, passengerErrors: [] };
    }
    case 'HOLD_FAILED':
      return classifyHoldError(event.error);
    case 'HOLD_SYNC': {
      // Solo importa mientras el hold está en uso; durante el pago manda la respuesta de la reserva.
      if (state.step !== 'held' && state.step !== 'rejected' && !(state.step === 'error' && state.during === 'payment')) return state;
      const end = endOf(event.hold, event.now);
      if (end) return { step: 'expired', reason: end };
      return { ...state, hold: event.hold };
    }
    case 'TIME_UP':
      return state.step === 'held' || state.step === 'rejected' || (state.step === 'error' && state.during === 'payment')
        ? { step: 'expired', reason: 'expired' }
        : state;
    case 'PASSENGERS':
      // Al continuar con los datos ya revisados, el error de asientos queda atendido.
      return state.step === 'held'
        ? { ...state, passengersReady: event.ready, passengerErrors: [], bookingError: event.ready ? undefined : state.bookingError }
        : state;
    case 'PAY_START': {
      const hold = holdOf(state);
      const canPay = (state.step === 'held' && state.passengersReady) || state.step === 'rejected' || (state.step === 'error' && state.during === 'payment');
      return canPay && hold ? { step: 'paying', hold } : state;
    }
    case 'BOOKED':
      return bookingResult(event.booking);
    case 'PAY_FAILED':
      return state.step === 'paying' ? classifyPaymentError(event.error, state.hold) : state;
    case 'POLL_GAVE_UP':
      return state.step === 'processing' ? { ...state, gaveUp: true } : state;
  }
}
