import type { AuthSession, Booking, Hold, User } from '../types';

/** Base de datos simulada persistida en localStorage (solo para el mock). */
export interface StoredUser extends User {
  passwordHash: string;
}

export interface MockDb {
  version: number;
  /** Día (yyyy-MM-dd) en que se generaron las reservas de demostración. */
  seededOn: string;
  users: StoredUser[];
  sessions: AuthSession[];
  holds: Hold[];
  bookings: Booking[];
}

const KEY = 'quinde.mock.db';
export const DB_VERSION = 2;

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
