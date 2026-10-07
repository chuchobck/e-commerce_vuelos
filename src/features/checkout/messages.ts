import { errorMessage, isApiError } from '@/shared/api';
import { es } from '@/shared/i18n';
import type { CheckoutState } from './machine';

const m = es.purchaseErrors;

export interface PurchaseNotice {
  tone: 'info' | 'warning' | 'error';
  title: string;
  text: string;
}

/**
 * Mensaje para el estado de la compra (catálogo en shared/i18n, `purchaseErrors`): qué pasó y qué
 * hacer. `null` si el estado no necesita aviso. Nunca muestra el detalle técnico de la API.
 */
export function purchaseNotice(state: CheckoutState): PurchaseNotice | null {
  switch (state.step) {
    case 'unavailable':
      return state.error.status === 409
        ? { tone: 'error', title: m.unavailableTitle, text: m.unavailableText }
        : { tone: 'error', title: m.selectionTitle, text: m.selectionText };
    case 'expired':
      if (state.reason === 'released') return { tone: 'error', title: m.releasedTitle, text: m.releasedText };
      if (state.reason === 'consumed') return { tone: 'warning', title: m.consumedTitle, text: m.consumedText };
      if (state.reason === 'missing') return { tone: 'error', title: m.missingTitle, text: m.missingText };
      return { tone: 'error', title: m.expiredTitle, text: m.expiredText };
    case 'rejected':
      return state.problem === 'declined'
        ? { tone: 'error', title: m.declinedTitle, text: m.declinedText }
        : { tone: 'error', title: m.invalidReferenceTitle, text: m.invalidReferenceText };
    case 'error':
      return state.during === 'hold'
        ? { tone: 'error', title: m.holdErrorTitle, text: errorMessage(state.error) }
        : {
            tone: 'error',
            title: m.paymentErrorTitle,
            // Un 429 o 503 dice cuánto esperar; lo demás, que reintentar es seguro.
            text: isApiError(state.error) && (state.error.status === 429 || state.error.status === 503) ? errorMessage(state.error) : m.paymentErrorText,
          };
    case 'held':
      if (state.bookingError) {
        const cabin = state.bookingError.code === 'SEAT_CABIN_MISMATCH';
        return { tone: 'warning', title: es.checkoutForms.seatsTakenTitle, text: cabin ? es.checkoutForms.seatsCabinText : es.checkoutForms.seatsTakenText };
      }
      return state.passengerErrors.length > 0 ? { tone: 'warning', title: m.passengersTitle, text: m.passengersText } : null;
    case 'processing':
      return state.gaveUp ? { tone: 'warning', title: m.gaveUpTitle, text: m.gaveUpText } : { tone: 'info', title: m.processingTitle, text: m.processingText };
    case 'failed':
      return { tone: 'error', title: m.failedTitle, text: m.failedText };
    default:
      return null;
  }
}
