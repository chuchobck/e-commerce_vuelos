import type { BookingDetailDto, HoldRequestDto, ItineraryDto, MoneyDto } from '../contract';
import type { HoldStatus, User } from '../types';

/** Base de datos simulada persistida en localStorage (solo para el mock). */
export interface StoredUser extends User {
  passwordHash: string;
  active: boolean;
}

/** Refresh token del mock, con las reglas de la API: rotación por familia y detección de reutilización. */
export interface StoredRefreshToken {
  token: string;
  family: string;
  userId: string;
  expiresAt: string;
  /** Ya se usó para renovar: volver a usarlo es una reutilización. */
  replaced: boolean;
  revoked: boolean;
}

/** Hold del mock: el pedido original (forma del contrato) y su estado. */
export interface StoredHold {
  id: string;
  ownerId: string;
  status: HoldStatus;
  createdAt: string;
  expiresAt: string;
  request: HoldRequestDto;
  lockedPrice: MoneyDto;
}

/** Reserva del mock: el BookingDetail del contrato más lo que la API guarda aparte. */
export interface StoredBooking {
  dto: BookingDetailDto;
  ownerId: string;
  /** Pago pendiente: cuándo lo confirma el "proceso de emisión". */
  issueAfter?: string;
  /** Check-in hecho en algún vuelo (la API lo sabe por sus pases). */
  checkedIn: boolean;
  /** Vuelos (segmentId) con check-in: la ventana de 48 h a 60 min es por vuelo, como en la API real. */
  checkedInSegments?: string[];
  /** Postventa aceptada con 202: se aplica cuando madura, como el proceso asíncrono del GDS. */
  pending?: PendingAftersale;
  /** Solo demostración: la cancelación de esta reserva queda en proceso (202, CANCELLATION_PENDING). */
  slowCancel?: boolean;
}

export type PendingAftersale =
  | { kind: 'baggage'; applyAfter: string; passengerId: string; itineraryId: string; quantity: number }
  | { kind: 'date-change'; applyAfter: string; offerId: string }
  | { kind: 'cancel'; applyAfter: string };

/** Oferta de cambio de fecha (POST date-change/search): vence a los 15 minutos. */
export interface StoredChangeOffer {
  id: string;
  bookingId: string;
  ownerId: string;
  /** Itinerario de la reserva que se reemplaza. */
  replacesItineraryId: string;
  /** Itinerario nuevo, con la familia vendida. */
  itinerary: ItineraryDto;
  expiresAt: string;
  /** Total a pagar (negativo = reembolso), en centavos. */
  totalCents: number;
}

/** Cotización de cancelación: vence a los 10 minutos. */
export interface StoredQuote {
  id: string;
  bookingId: string;
  ownerId: string;
  refund: string;
  penalty: string;
  currency: string;
  refundable: boolean;
  expiresAt: string;
}

/** Idempotency-Key usada: por usuario y operación, con la huella del cuerpo. */
export interface StoredIdempotencyKey {
  scope: 'hold' | 'booking' | 'baggage' | 'date-change' | 'cancel';
  ownerId: string;
  key: string;
  bodyHash: string;
  resultId: string;
  /** Postventa: lo que respondió la primera vez, para repetirlo. */
  outcome?: 'done' | 'pending';
}

export interface MockDb {
  version: number;
  /** Día (yyyy-MM-dd) en que se generaron las reservas de demostración. */
  seededOn: string;
  users: StoredUser[];
  refreshTokens: StoredRefreshToken[];
  holds: StoredHold[];
  bookings: StoredBooking[];
  idempotency: StoredIdempotencyKey[];
  /** Referencias de pago ya usadas (la API rechaza reusarlas con 409). */
  paymentReferences: string[];
  changeOffers: StoredChangeOffer[];
  quotes: StoredQuote[];
}

const KEY = 'quinde.mock.db';
export const DB_VERSION = 6;

let memory: MockDb | null = null;

/**
 * Carga la base simulada. `refresh` renueva los datos de demostración que dependen de la
 * fecha (p. ej. la reserva dentro de la ventana de check-in) sin borrar lo creado por el usuario.
 */
export function loadDb(seed: () => MockDb, refresh?: (db: MockDb) => MockDb): MockDb {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDb;
      if (parsed.version === DB_VERSION) {
        const db = refresh ? refresh(parsed) : parsed;
        if (db !== parsed) saveDb(db);
        memory = db;
        return db;
      }
    }
  } catch {
    /* almacenamiento no disponible: se usa memoria */
  }
  memory = seed();
  saveDb(memory);
  return memory;
}

export function saveDb(db: MockDb): void {
  memory = db;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* sin persistencia */
  }
}

/** Hash de contraseña para el mock (nunca guardamos texto plano, ni siquiera simulado). */
export async function hashPassword(password: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(`quinde:${password}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let h = 0;
  for (const ch of `quinde:${password}`) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return `fallback-${h}`;
}
