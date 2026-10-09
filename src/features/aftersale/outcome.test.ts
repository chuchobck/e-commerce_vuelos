import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/api';
import { classifyPaymentError } from './outcome';
import { isPaymentReference, newPaymentReference, referenceFor } from './paymentReference';

describe('qué le pasó a un cobro', () => {
  const err = (status: number, code?: ApiError['code']) => new ApiError({ status, code });

  it('422 PAYMENT_NOT_AUTHORIZED es rechazo; la referencia mala o repetida pide otra', () => {
    expect(classifyPaymentError(err(422, 'PAYMENT_NOT_AUTHORIZED'))).toBe('rejected');
    expect(classifyPaymentError(err(422, 'PAYMENT_REFERENCE_INVALID'))).toBe('reference');
    expect(classifyPaymentError(err(409, 'PAYMENT_REFERENCE_INVALID'))).toBe('reference');
  });

  it('una oferta o cotización vencida hay que pedirla de nuevo', () => {
    expect(classifyPaymentError(err(410, 'CHANGE_OFFER_EXPIRED'))).toBe('expired');
    expect(classifyPaymentError(err(409, 'QUOTE_EXPIRED'))).toBe('expired');
  });

  it('403 es falta de permiso; cualquier otra cosa (incluso un error que no es de la API) es "other"', () => {
    expect(classifyPaymentError(err(403))).toBe('permission');
    expect(classifyPaymentError(err(403))).toBe('permission');
    expect(classifyPaymentError(err(500))).toBe('other');
    expect(classifyPaymentError(new Error('red'))).toBe('other');
    expect(classifyPaymentError(undefined)).toBe('other');
  });
});

describe('referencias de pago', () => {
  it('la referencia nueva cumple el formato del backend y trae el resultado pedido', () => {
    for (const outcome of ['OK', 'PEND', 'REJ'] as const) {
      const ref = newPaymentReference(outcome);
      expect(isPaymentReference(ref)).toBe(true);
      expect(ref.startsWith(`PAY-${outcome}-`)).toBe(true);
    }
    expect(newPaymentReference()).toMatch(/^PAY-OK-/);
    expect(newPaymentReference()).not.toBe(newPaymentReference());
  });

  it('rechaza lo que no es una referencia (nunca un número de tarjeta)', () => {
    for (const bad of ['', 'PAY-OK-', 'PAY-OK-abc', 'PAY-XX-ABCD1234', '4111111111111111', 'PAY-OK-AB']) {
      expect(isPaymentReference(bad)).toBe(false);
    }
  });

  it('con varias líneas la primera usa la referencia tal cual y las demás una distinta que conserva el resultado', () => {
    const base = 'PAY-REJ-ABC123';
    const refs = [0, 1, 2].map((i) => referenceFor(base, i));
    expect(refs).toEqual(['PAY-REJ-ABC123', 'PAY-REJ-ABC1232', 'PAY-REJ-ABC1233']);
    expect(new Set(refs).size).toBe(3);
    expect(refs.every((r) => isPaymentReference(r) && r.startsWith('PAY-REJ-'))).toBe(true);
  });
});
