import { describe, expect, it } from 'vitest';
import { createIntentKeys, type StorageLike } from './idempotency';

function memoryStorage(): StorageLike & { dump(): string } {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    dump: () => [...data.values()].join(''),
  };
}

function counter() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

const SELECTION = { offerId: 'o1', itinerarySelections: [{ itineraryId: 'i1', cabinClass: 'ECONOMY', fareBrand: 'BASIC' }], passengersBreakdown: { adults: 1 } };
const ORDER = { holdId: 'h1', passengers: [{ id: 'PAX1', firstName: 'Ana', documentNumber: '1710034065' }], paymentReference: 'PAY-OK-ABCD1234' };

describe('claves de idempotencia: una por intención', () => {
  it('mismo contenido = misma clave (reintento tras error de red o doble clic)', () => {
    const keys = createIntentKeys(memoryStorage(), counter());
    const first = keys.keyFor('hold', SELECTION);
    expect(keys.keyFor('hold', SELECTION)).toBe(first);
    // El orden de las propiedades no cambia la intención.
    expect(keys.keyFor('hold', { passengersBreakdown: { adults: 1 }, itinerarySelections: SELECTION.itinerarySelections, offerId: 'o1' })).toBe(first);
  });

  it('contenido distinto = clave nueva (nunca la misma clave con otro cuerpo)', () => {
    const keys = createIntentKeys(memoryStorage(), counter());
    const a = keys.keyFor('booking', ORDER);
    const b = keys.keyFor('booking', { ...ORDER, paymentReference: 'PAY-OK-WXYZ9876' });
    expect(b).not.toBe(a);
    // Volver al contenido anterior tampoco reusa la clave vieja: ya fue reemplazada.
    expect(keys.keyFor('booking', ORDER)).not.toBe(a);
  });

  it('hold y reserva tienen claves independientes', () => {
    const keys = createIntentKeys(memoryStorage(), counter());
    const hold = keys.keyFor('hold', SELECTION);
    keys.keyFor('booking', ORDER);
    expect(keys.keyFor('hold', SELECTION)).toBe(hold);
  });

  it('sobrevive a recargar la página (sessionStorage) y no guarda el contenido', () => {
    const storage = memoryStorage();
    const key = createIntentKeys(storage, counter()).keyFor('booking', ORDER);
    expect(createIntentKeys(storage, counter()).keyFor('booking', ORDER)).toBe(key);
    expect(storage.dump()).not.toContain('Ana');
    expect(storage.dump()).not.toContain('1710034065');
    expect(storage.dump()).not.toContain('PAY-OK');
  });

  it('caduca al terminar la intención o la compra', () => {
    const storage = memoryStorage();
    const keys = createIntentKeys(storage, counter());
    const hold = keys.keyFor('hold', SELECTION);
    const booking = keys.keyFor('booking', ORDER);
    keys.forget('hold'); // p. ej. el hold venció: la misma selección necesita un hold nuevo
    expect(keys.keyFor('hold', SELECTION)).not.toBe(hold);
    expect(keys.keyFor('booking', ORDER)).toBe(booking);
    keys.clear();
    expect(storage.dump()).toBe('');
    expect(keys.keyFor('booking', ORDER)).not.toBe(booking);
  });

  it('sin almacenamiento disponible funciona en memoria', () => {
    const keys = createIntentKeys(null, counter());
    expect(keys.keyFor('hold', SELECTION)).toBe(keys.keyFor('hold', SELECTION));
  });
});
