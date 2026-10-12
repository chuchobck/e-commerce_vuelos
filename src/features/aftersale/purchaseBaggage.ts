import type { AddBaggageRequest, BaggageAdded, PostSaleOutcome } from '@/shared/api';
import type { AttemptKeys } from '@/shared/lib/attemptKeys';
import { classifyPaymentError } from './outcome';
import { referenceFor } from './paymentReference';

export interface BaggageToBuy {
  passengerId: string;
  itineraryId: string;
  quantity: number;
}

export type LineStatus = 'done' | 'pending' | 'rejected' | 'failed';

export interface LineResult {
  passengerId: string;
  itineraryId: string;
  status: LineStatus;
  /** Maletas extra que tiene ahora el pasajero en ese itinerario (cuando la API lo dice). */
  totalBaggage?: number | null;
  error?: unknown;
}

export interface BaggageDeps {
  add: (bookingId: string, request: AddBaggageRequest, idempotencyKey: string) => Promise<PostSaleOutcome<BaggageAdded>>;
  keys: AttemptKeys;
}

export const baggageScope = (bookingId: string, line: Pick<BaggageToBuy, 'passengerId' | 'itineraryId'>) =>
  `baggage:${bookingId}:${line.passengerId}:${line.itineraryId}`;

/**
 * Compra las maletas línea por línea (la API acepta un pasajero y un itinerario por petición, cada una con su cobro).
 *
 *  - Cada línea lleva su referencia de pago (`referenceFor`) y su Idempotency-Key, una por intento: reintentar la misma línea con el mismo
 *    pago reenvía la misma clave; cambiar el pago (tras un rechazo) o la cantidad da una clave nueva.
 *  - 200/201 → `done` (se olvida la clave); 202 → `pending` (la clave se conserva: es el mismo intento).
 *  - 422 de pago rechazado → `rejected`; cualquier otro error → `failed`. En ambos casos se DETIENE: no se sigue cobrando el resto y
 *    lo que falta queda sin intentar (no aparece en el resultado), para reintentar con otro pago sin perder la selección.
 */
export async function purchaseBaggage(bookingId: string, lines: readonly BaggageToBuy[], baseReference: string, deps: BaggageDeps): Promise<LineResult[]> {
  const results: LineResult[] = [];
  for (const [index, line] of lines.entries()) {
    const request: AddBaggageRequest = { ...line, paymentReference: referenceFor(baseReference, index) };
    const scope = baggageScope(bookingId, line);
    try {
      const outcome = await deps.add(bookingId, request, deps.keys.keyFor(scope, request));
      if (outcome.status === 'done') {
        deps.keys.forget(scope);
        results.push({ passengerId: line.passengerId, itineraryId: line.itineraryId, status: 'done', totalBaggage: outcome.data.totalBaggage });
      } else {
        results.push({ passengerId: line.passengerId, itineraryId: line.itineraryId, status: 'pending' });
      }
    } catch (error) {
      results.push({ passengerId: line.passengerId, itineraryId: line.itineraryId, status: classifyPaymentError(error) === 'rejected' ? 'rejected' : 'failed', error });
      break;
    }
  }
  return results;
}

/** Resumen de una compra de varias líneas, para elegir qué mensaje mostrar. */
export type BaggageOverall = 'done' | 'pending' | 'rejected' | 'partial' | 'failed';

export function overallOf(results: readonly LineResult[], attempted: number): BaggageOverall {
  const bad = results.find((r) => r.status === 'rejected' || r.status === 'failed');
  const ok = results.filter((r) => r.status === 'done').length;
  const pending = results.filter((r) => r.status === 'pending').length;
  if (bad) return ok + pending > 0 ? 'partial' : bad.status === 'rejected' ? 'rejected' : 'failed';
  if (results.length < attempted) return 'partial';
  return pending > 0 ? 'pending' : 'done';
}
