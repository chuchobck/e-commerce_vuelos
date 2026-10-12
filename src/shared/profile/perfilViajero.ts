import { emptyTraveler, TRAVELER_KEYS, type TravelerKey, type TravelerValues } from './traveler';

/**
 * Perfil de viajero: los datos de quien viaja (nombre, documento, nacimiento, contacto) guardados SOLO en este dispositivo,
 * para llenar el pasajero 1 de la compra. El backend no tiene perfil: `POST /auth/register` recibe solo correo y contraseña
 * y nada de esto viaja a ningún servidor. Es el único lugar que toca el almacenamiento del perfil.
 *
 *  - Una entrada por usuario (`quinde.perfil.v1:<id del usuario>`): quien comparte el navegador no ve ni pisa los datos de otro.
 *  - Todo va en try/catch: sin almacenamiento (modo privado, cuota, bloqueado) la app funciona igual; `save` y `remove` dicen
 *    con un booleano si pudieron.
 *  - Lo que se guarda es una lista cerrada de campos (`TRAVELER_KEYS`): contraseñas y tokens no pueden entrar.
 *  - Cerrar sesión NO lo borra (se pidió así); `remove` lo borra, y la interfaz lo ofrece.
 *  - El aviso «Completa tu perfil» se puede descartar por sesión del navegador (sessionStorage).
 */
const KEY_PREFIX = 'quinde.perfil.v1:';
const NOTICE_PREFIX = 'quinde.perfil.aviso:';
const VERSION = 1;
/** Ningún dato de una persona es más largo: un valor enorme en el almacenamiento se descarta. */
const MAX_VALUE_LENGTH = 200;

export interface PerfilStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PerfilViajeroDeps {
  /** Dónde vive el perfil (por defecto, localStorage). */
  local?: () => PerfilStorage | null;
  /** Dónde se recuerda que se descartó el aviso (por defecto, sessionStorage). */
  session?: () => PerfilStorage | null;
}

const DOCUMENT_TYPES = ['NATIONAL_ID', 'PASSPORT'] as const;
const GENDERS = ['', 'F', 'M', 'X'] as const;

/**
 * De lo guardado a unos datos usables, sin confiar en su forma: lo que no es texto razonable se descarta y los valores que no
 * son del catálogo (tipo de documento, sexo) vuelven al valor vacío. `null` si no hay nada o no es un perfil de esta versión.
 */
export function parseStoredProfile(raw: string | null): TravelerValues | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { version, data } = parsed as { version?: unknown; data?: unknown };
    if (version !== VERSION || typeof data !== 'object' || data === null) return null;
    const source = data as Record<string, unknown>;
    const text = (key: TravelerKey): string => {
      const value = source[key];
      return typeof value === 'string' && value.length <= MAX_VALUE_LENGTH ? value : '';
    };
    const documentType = DOCUMENT_TYPES.find((d) => d === source.documentType) ?? 'NATIONAL_ID';
    const gender = GENDERS.find((g) => g === source.gender) ?? '';
    return { ...emptyTraveler(), firstName: text('firstName'), lastName: text('lastName'), documentType, documentNumber: text('documentNumber'), nationality: text('nationality') || 'EC', gender, birthDate: text('birthDate'), documentExpiryDate: text('documentExpiryDate'), email: text('email'), phone: text('phone') };
  } catch {
    return null;
  }
}

function browserStorage(kind: 'localStorage' | 'sessionStorage'): PerfilStorage | null {
  try {
    return globalThis[kind] ?? null;
  } catch {
    return null;
  }
}

export function createPerfilViajero({ local = () => browserStorage('localStorage'), session = () => browserStorage('sessionStorage') }: PerfilViajeroDeps = {}) {
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  const keyOf = (userId: string) => `${KEY_PREFIX}${userId}`;

  /** El texto guardado tal cual (para que React lo compare por valor); null si no hay, no hay usuario o el almacenamiento falla. */
  function raw(userId: string | null | undefined): string | null {
    if (!userId) return null;
    try {
      return local()?.getItem(keyOf(userId)) ?? null;
    } catch {
      return null;
    }
  }

  return {
    raw,

    /** El perfil guardado de este usuario, o null si no hay (o no se puede leer). */
    read: (userId: string | null | undefined): TravelerValues | null => parseStoredProfile(raw(userId)),

    /** Guarda el perfil. Solo los campos de la lista cerrada. `false` si no hay usuario o el almacenamiento no lo permitió. */
    save(userId: string | null | undefined, values: TravelerValues): boolean {
      if (!userId) return false;
      const data = Object.fromEntries(TRAVELER_KEYS.map((key) => [key, values[key]]));
      try {
        const storage = local();
        if (!storage) return false;
        storage.setItem(keyOf(userId), JSON.stringify({ version: VERSION, savedAt: new Date().toISOString(), data }));
      } catch {
        return false;
      }
      notify();
      return true;
    },

    /** Borra el perfil de este usuario. `false` si el almacenamiento no lo permitió. */
    remove(userId: string | null | undefined): boolean {
      if (!userId) return false;
      try {
        local()?.removeItem(keyOf(userId));
      } catch {
        return false;
      }
      notify();
      return true;
    },

    /** Avisa cuando el perfil cambia aquí o en otra pestaña (evento `storage`). */
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key.startsWith(KEY_PREFIX)) listener();
      };
      globalThis.addEventListener?.('storage', onStorage);
      return () => {
        listeners.delete(listener);
        globalThis.removeEventListener?.('storage', onStorage);
      };
    },

    noticeDismissed(userId: string | null | undefined): boolean {
      if (!userId) return false;
      try {
        return session()?.getItem(`${NOTICE_PREFIX}${userId}`) === '1';
      } catch {
        return false;
      }
    },

    dismissNotice(userId: string | null | undefined): void {
      if (!userId) return;
      try {
        session()?.setItem(`${NOTICE_PREFIX}${userId}`, '1');
      } catch {
        /* sin almacenamiento: el aviso vuelve en la próxima página, no pasa nada */
      }
    },
  };
}

export type PerfilViajeroService = ReturnType<typeof createPerfilViajero>;

/** El servicio único de la aplicación. */
export const perfilViajero = createPerfilViajero();
