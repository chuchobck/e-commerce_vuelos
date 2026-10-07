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

const isText = (v: unknown): v is string => typeof v === 'string';

/**
 * Un borrador viejo o dañado no debe romper la pantalla: se descartan los asientos que no tengan el
 * formato por tramo (`seats: { segmentId, seatNumber }[]`, p. ej. el `seatId` suelto del formato
 * antiguo) y, si un pasajero no se reconoce, se ignora todo el borrador.
 */
export function sanitizeDraft(raw: unknown): BookingPassenger[] {
  if (!Array.isArray(raw)) return [];
  const out: BookingPassenger[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return [];
    const { seatId: _legacy, seats, ...rest } = item as BookingPassenger & { seatId?: unknown };
    if (!isText(rest.id) || !isText(rest.type) || !isText(rest.firstName) || !isText(rest.birthDate)) return [];
    const valid = Array.isArray(seats) ? seats.filter((s) => s && isText(s.segmentId) && isText(s.seatNumber)) : [];
    out.push(valid.length > 0 ? { ...rest, seats: valid } : rest);
  }
  return out;
}

export function createDraftStore(storage: StorageLike | null): PassengerDraftStore {
  let memory: BookingPassenger[] = [];
  return {
    load() {
      try {
        const raw = storage?.getItem(KEY);
        if (!raw) return memory;
        return sanitizeDraft(JSON.parse(raw));
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
