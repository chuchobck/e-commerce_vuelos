import type { BookingPassenger } from '@/shared/api';
import type { StorageLike } from './idempotency';

/**
 * Borrador de los pasajeros: lo escrito sobrevive a refrescar, a que el hold venza y a buscar de
 * nuevo (README, sección 5). Vive en sessionStorage (dura lo que la pestaña y no se comparte); se
 * borra al confirmar o cancelar la compra. Nunca lleva datos de tarjeta.
 */
const KEY = 'quinde.checkout.draft';

export interface PassengerDraftStore {
  load(): BookingPassenger[];
  save(passengers: BookingPassenger[]): void;
  clear(): void;
}

/**
 * Último intento de pago: el hold y la referencia que se enviaron (nunca datos de tarjeta). Si la
 * página se recarga con el pago en curso, el hold aparece CONSUMED; reenviar el MISMO pedido con la
 * MISMA clave hace que la API repita la respuesta y devuelva la reserva que sí se creó.
 */
const ATTEMPT_KEY = 'quinde.checkout.attempt';

export interface PaymentAttempt {
  holdId: string;
  paymentReference: string;
}

export interface AttemptStore {
  load(): PaymentAttempt | null;
  save(attempt: PaymentAttempt): void;
  clear(): void;
}

export function createAttemptStore(storage: StorageLike | null): AttemptStore {
  let memory: PaymentAttempt | null = null;
  return {
    load() {
      try {
        const raw = storage?.getItem(ATTEMPT_KEY);
        if (!raw) return memory;
        const parsed = JSON.parse(raw) as PaymentAttempt | null;
        return parsed && typeof parsed.holdId === 'string' && typeof parsed.paymentReference === 'string' ? parsed : memory;
      } catch {
        return memory;
      }
    },
    save(attempt) {
      memory = attempt;
      try {
        storage?.setItem(ATTEMPT_KEY, JSON.stringify(attempt));
      } catch {
        /* queda en memoria */
      }
    },
    clear() {
      memory = null;
      try {
        storage?.removeItem(ATTEMPT_KEY);
      } catch {
        /* sin almacenamiento */
      }
    },
  };
}

export function createDraftStore(storage: StorageLike | null): PassengerDraftStore {
  let memory: BookingPassenger[] = [];
  return {
    load() {
      try {
        const raw = storage?.getItem(KEY);
        if (!raw) return memory;
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as BookingPassenger[]) : memory;
      } catch {
        return memory;
      }
    },
    save(passengers) {
      memory = passengers;
      try {
        storage?.setItem(KEY, JSON.stringify(passengers));
      } catch {
        /* queda en memoria */
      }
    },
    clear() {
      memory = [];
      try {
        storage?.removeItem(KEY);
      } catch {
        /* sin almacenamiento */
      }
    },
  };
}
