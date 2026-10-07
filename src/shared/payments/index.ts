/**
 * Pagos (README, sección 5). La API de vuelos no recibe tarjetas: recibe una `paymentReference` de
 * la Payment API. Mientras esa API no exista (RDA1), este módulo la simula con las reglas del
 * backend: el prefijo de la referencia decide el resultado (PAY-OK- aprobado, PAY-PEND- pendiente,
 * PAY-REJ- rechazado).
 *
 * Reemplazable: la compra solo conoce `PaymentProvider`. Para la Payment API real basta otra
 * implementación de `authorize` (que hable con esa API desde el navegador o con su SDK) y cambiar
 * `payments` abajo.
 *
 * Los datos de tarjeta NUNCA salen del navegador, no se guardan (ni en sessionStorage), no se
 * registran en la consola y se borran del objeto en cuanto se usan (`wipeCard`).
 */
import type { Money } from '@/shared/lib/money';
import { isFutureExpiry, isValidExpiryFormat, isValidLuhn } from '@/shared/lib/validators';

export interface CardDetails {
  /** Solo dígitos. */
  number: string;
  holder: string;
  /** MM/AA. */
  expiry: string;
  cvv: string;
}

export interface PaymentAuthorization {
  /** Lo único que viaja a POST /bookings. */
  reference: string;
}

export interface PaymentProvider {
  /** true si es la Payment API simulada (la interfaz lo rotula como "Pago simulado"). */
  readonly simulated: boolean;
  authorize(card: CardDetails, amount: Money): Promise<PaymentAuthorization>;
}

/** Tarjetas de prueba (números ficticios con Luhn válido). Solo se muestran con el mock o en desarrollo. */
export const TEST_CARDS = {
  approved: '4111111111111111',
  declined: '4000000000000002',
  pending: '4000000000003220',
} as const;

export type SimulatedOutcome = 'OK' | 'PEND' | 'REJ';

/** Qué responde la Payment API simulada a una tarjeta válida: cualquier otra que no sea de prueba, aprobada. */
export function simulatedOutcome(cardNumber: string): SimulatedOutcome {
  if (cardNumber === TEST_CARDS.declined) return 'REJ';
  if (cardNumber === TEST_CARDS.pending) return 'PEND';
  return 'OK';
}

/** Código único de la referencia: 16 caracteres A-Z0-9 (la API acepta 4 a 50). */
function referenceCode(random: () => number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 16 }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
}

function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 2 ** 32;
}

/** Valida la tarjeta como lo haría una pasarela antes de cobrar. */
export function isCardUsable(card: CardDetails, now: Date = new Date()): boolean {
  return (
    isValidLuhn(card.number) &&
    card.holder.trim().length > 0 &&
    isValidExpiryFormat(card.expiry) &&
    isFutureExpiry(card.expiry, now) &&
    /^\d{3,4}$/.test(card.cvv)
  );
}

/** Borra los datos de tarjeta del objeto (lo que quede en memoria no sirve para nada). */
export function wipeCard(card: CardDetails): void {
  card.number = '';
  card.holder = '';
  card.expiry = '';
  card.cvv = '';
}

export function createSimulatedPayments({ random = cryptoRandom, now = () => new Date() } = {}): PaymentProvider {
  return {
    simulated: true,
    async authorize(card) {
      if (!isCardUsable(card, now())) throw new Error('Tarjeta inválida');
      // Cada intento es un pago distinto: la API rechaza reusar una referencia (409).
      return { reference: `PAY-${simulatedOutcome(card.number)}-${referenceCode(random)}` };
    },
  };
}

/** El proveedor de pagos de la aplicación. */
export const payments: PaymentProvider = createSimulatedPayments();
