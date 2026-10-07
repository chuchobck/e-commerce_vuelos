// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidLuhn } from '@/shared/lib/validators';
import { createSimulatedPayments, isCardUsable, simulatedOutcome, TEST_CARDS, wipeCard, type CardDetails } from './index';

const AMOUNT = { cents: 7392, currency: 'USD' };
const NOW = new Date('2026-10-07T12:00:00Z');
const card = (number: string): CardDetails => ({ number, holder: 'ANA PEREZ', expiry: '12/30', cvv: '123' });
/** La regla del backend (pagos-simulados.ts). */
const BACKEND_RULE = /^PAY-(OK|PEND|REJ)-[A-Z0-9]{4,50}$/;

afterEach(() => vi.restoreAllMocks());

describe('pago simulado', () => {
  it('las tarjetas de prueba son Luhn-válidas y cada una da su prefijo', async () => {
    const pay = createSimulatedPayments({ now: () => NOW });
    for (const number of Object.values(TEST_CARDS)) expect(isValidLuhn(number)).toBe(true);
    expect((await pay.authorize(card(TEST_CARDS.approved), AMOUNT)).reference).toMatch(/^PAY-OK-/);
    expect((await pay.authorize(card(TEST_CARDS.declined), AMOUNT)).reference).toMatch(/^PAY-REJ-/);
    expect((await pay.authorize(card(TEST_CARDS.pending), AMOUNT)).reference).toMatch(/^PAY-PEND-/);
    // Cualquier otra tarjeta válida se aprueba.
    expect(simulatedOutcome('5555555555554444')).toBe('OK');
  });

  it('la referencia cumple la regla del backend y es distinta en cada intento', async () => {
    const pay = createSimulatedPayments({ now: () => NOW });
    const a = (await pay.authorize(card(TEST_CARDS.approved), AMOUNT)).reference;
    const b = (await pay.authorize(card(TEST_CARDS.approved), AMOUNT)).reference;
    expect(a).toMatch(BACKEND_RULE);
    expect(a).not.toBe(b);
  });

  it('rechaza una tarjeta inválida (Luhn, vencida o CVV) sin generar referencia', async () => {
    const pay = createSimulatedPayments({ now: () => NOW });
    await expect(pay.authorize(card('4111111111111112'), AMOUNT)).rejects.toThrow();
    await expect(pay.authorize({ ...card(TEST_CARDS.approved), expiry: '01/20' }, AMOUNT)).rejects.toThrow();
    expect(isCardUsable({ ...card(TEST_CARDS.approved), cvv: '12' }, NOW)).toBe(false);
  });

  it('nada se persiste ni se registra, y los datos se pueden borrar del objeto', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    const pay = createSimulatedPayments({ now: () => NOW });
    const details = card(TEST_CARDS.approved);
    const { reference } = await pay.authorize(details, AMOUNT);
    expect(reference).not.toContain(TEST_CARDS.approved.slice(-4));
    expect(setItem).not.toHaveBeenCalled();
    for (const log of logs) expect(log).not.toHaveBeenCalled();
    wipeCard(details);
    expect(details).toEqual({ number: '', holder: '', expiry: '', cvv: '' });
  });
});
