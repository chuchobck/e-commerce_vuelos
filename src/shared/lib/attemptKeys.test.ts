import { describe, expect, it } from 'vitest';
import { createAttemptKeys, type AttemptStorage } from './attemptKeys';

function memoryStorage(): AttemptStorage & { raw: () => string | null } {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_k, v) => void (value = v),
    removeItem: () => void (value = null),
    raw: () => value,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('claves de idempotencia por intento', () => {
  it('genera un UUID y lo reutiliza mientras el contenido sea el mismo (reintentos, 202, doble clic)', () => {
    const keys = createAttemptKeys(memoryStorage());
    const first = keys.keyFor('baggage:b1', { quantity: 2, paymentReference: 'PAY-OK-AAAA1111' });
    expect(first).toMatch(UUID);
    expect(keys.keyFor('baggage:b1', { paymentReference: 'PAY-OK-AAAA1111', quantity: 2 })).toBe(first);
    expect(keys.keyFor('baggage:b1', { quantity: 2, paymentReference: 'PAY-OK-AAAA1111' })).toBe(first);
  });

  it('un contenido distinto (otro pago tras un rechazo) es otro intento: clave nueva', () => {
    const keys = createAttemptKeys(memoryStorage());
    const rejected = keys.keyFor('baggage:b1', { quantity: 1, paymentReference: 'PAY-REJ-AAAA1111' });
    const retried = keys.keyFor('baggage:b1', { quantity: 1, paymentReference: 'PAY-OK-BBBB2222' });
    expect(retried).not.toBe(rejected);
    // Volver al contenido anterior ya no devuelve la clave vieja: nunca se reusa una clave con otro cuerpo.
    expect(keys.keyFor('baggage:b1', { quantity: 1, paymentReference: 'PAY-REJ-AAAA1111' })).not.toBe(rejected);
  });

  it('cada ámbito (operación y reserva) tiene su propia clave', () => {
    const keys = createAttemptKeys(memoryStorage());
    const a = keys.keyFor('cancel:b1', { quoteId: 'q1' });
    const b = keys.keyFor('cancel:b2', { quoteId: 'q1' });
    const c = keys.keyFor('check-in:b1');
    expect(new Set([a, b, c]).size).toBe(3);
    expect(keys.keyFor('cancel:b1', { quoteId: 'q1' })).toBe(a);
  });

  it('al terminar el intento, el mismo contenido tiene clave nueva', () => {
    const keys = createAttemptKeys(memoryStorage());
    const first = keys.keyFor('check-in:b1');
    keys.forget('check-in:b1');
    expect(keys.keyFor('check-in:b1')).not.toBe(first);
  });

  it('sobrevive a recargar la página y solo guarda la huella del contenido', () => {
    const storage = memoryStorage();
    const before = createAttemptKeys(storage).keyFor('cancel:b1', { quoteId: 'quote-secreta-123' });
    const after = createAttemptKeys(storage).keyFor('cancel:b1', { quoteId: 'quote-secreta-123' });
    expect(after).toBe(before);
    expect(storage.raw()).not.toContain('quote-secreta-123');
  });

  it('sin almacenamiento sigue funcionando en memoria', () => {
    const keys = createAttemptKeys(null);
    const first = keys.keyFor('x', { a: 1 });
    expect(keys.keyFor('x', { a: 1 })).toBe(first);
  });
});
