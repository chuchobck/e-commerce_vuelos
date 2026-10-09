import { newSimulatedReference, type SimulatedOutcome } from '@/shared/payments';

/**
 * Referencia de pago de la Payment API simulada (README, sección 5): `PAY-OK-`, `PAY-PEND-` o `PAY-REJ-` y 4 a 50 letras
 * mayúsculas o números. Es el mismo formato que valida el backend; la API real la verificará al cobrar.
 */
export const PAYMENT_REFERENCE = /^PAY-(OK|PEND|REJ)-[A-Z0-9]{4,50}$/;

export function isPaymentReference(value: string): boolean {
  return PAYMENT_REFERENCE.test(value);
}

export function referenceOutcome(value: string): SimulatedOutcome | null {
  return (PAYMENT_REFERENCE.exec(value)?.[1] as SimulatedOutcome | undefined) ?? null;
}

/** Referencia por defecto de un cobro: aprobada y distinta cada vez (la API rechaza reusar una referencia). */
export function newPaymentReference(outcome: SimulatedOutcome = 'OK'): string {
  return newSimulatedReference(outcome);
}

/**
 * Cuando una compra son varios cobros (una maleta extra por pasajero e itinerario = una petición cada una), cada cobro
 * necesita su propia referencia. La primera línea usa la referencia tal cual; las demás le agregan un número
 * ("PAY-OK-ABC123", "PAY-OK-ABC1232"…), así el resultado (OK, PEND, REJ) es el mismo para todas.
 */
export function referenceFor(base: string, index: number): string {
  return index === 0 ? base : `${base}${index + 1}`;
}
