import { describe, expect, it } from 'vitest';
import { ApiError, type Booking, type Hold } from '@/shared/api';
import { es } from '@/shared/i18n';
import { purchaseNotice } from './messages';

const m = es.purchaseErrors;
const hold = { id: 'h' } as Hold;
const booking = { id: 'b' } as Booking;

describe('catálogo de mensajes de compra', () => {
  it.each([
    [{ step: 'unavailable', error: new ApiError({ status: 409, code: 'OFFER_NO_LONGER_AVAILABLE' }) }, m.unavailableTitle],
    [{ step: 'unavailable', error: new ApiError({ status: 422, code: 'VALIDATION_FAILED' }) }, m.selectionTitle],
    [{ step: 'expired', reason: 'expired' }, m.expiredTitle],
    [{ step: 'expired', reason: 'released' }, m.releasedTitle],
    [{ step: 'expired', reason: 'consumed' }, m.consumedTitle],
    [{ step: 'expired', reason: 'missing' }, m.missingTitle],
    [{ step: 'rejected', hold, problem: 'declined' }, m.declinedTitle],
    [{ step: 'rejected', hold, problem: 'invalid-reference' }, m.invalidReferenceTitle],
    [{ step: 'error', error: new ApiError({ status: 0, code: 'NETWORK' }), during: 'hold' }, m.holdErrorTitle],
    [{ step: 'error', error: new ApiError({ status: 0, code: 'TIMEOUT' }), during: 'payment', hold }, m.paymentErrorTitle],
    [{ step: 'processing', booking, gaveUp: false }, m.processingTitle],
    [{ step: 'processing', booking, gaveUp: true }, m.gaveUpTitle],
    [{ step: 'failed', booking }, m.failedTitle],
    [{ step: 'held', hold, passengersReady: false, passengerErrors: [{ field: 'passengers[0].birthDate', message: 'x' }] }, m.passengersTitle],
  ] as const)('%o → su título', (state, title) => {
    expect(purchaseNotice(state as Parameters<typeof purchaseNotice>[0])?.title).toBe(title);
  });

  it('un error de pago reintentable dice que reintentar es seguro; un 429 dice cuánto esperar', () => {
    expect(purchaseNotice({ step: 'error', error: new ApiError({ status: 0, code: 'NETWORK' }), during: 'payment', hold })?.text).toBe(m.paymentErrorText);
    expect(purchaseNotice({ step: 'error', error: new ApiError({ status: 429, code: 'RATE_LIMIT_EXCEEDED', retryAfter: 38 }), during: 'payment', hold })?.text).toMatch(/38/);
  });

  it('sin aviso en los estados normales', () => {
    expect(purchaseNotice({ step: 'held', hold, passengersReady: true, passengerErrors: [] })).toBeNull();
    expect(purchaseNotice({ step: 'confirmed', booking })).toBeNull();
    expect(purchaseNotice({ step: 'holding' })).toBeNull();
  });
});
