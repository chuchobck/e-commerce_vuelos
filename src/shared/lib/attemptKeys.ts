import { stableHash } from './stableHash';

/**
 * Claves de idempotencia de la postventa (check-in, equipaje, cambio de fecha y cancelación):
 * UNA por intento del usuario.
 *
 * - El mismo contenido devuelve la misma clave: un reintento tras un error de red, un 202 o un doble clic
 *   reenvía la misma petición con la misma clave y la API repite la respuesta en vez de hacerlo dos veces.
 * - Si el contenido cambia (otra cantidad, otro pago tras un rechazo), la clave es nueva: la API respondería 422
 *   si se reusara una clave con otro cuerpo.
 * - Al terminar el intento (`forget`), el mismo contenido volverá a tener clave nueva: es otro intento.
 *
 * Se guarda solo la huella del contenido (que puede llevar datos personales), nunca el contenido.
 * Sobrevive a refrescar la página (sessionStorage): un reintento tras recargar no duplica el cobro.
 */
export interface AttemptKeys {
  /** Clave para este contenido: la guardada si es el mismo, o una nueva (que reemplaza a la anterior del ámbito). */
  keyFor(scope: string, content?: unknown): string;
  /** El intento terminó: el mismo contenido tendrá clave nueva. */
  forget(scope: string): void;
}

export interface AttemptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface Saved {
  hash: string;
  key: string;
}

const STORAGE_KEY = 'quinde.attempt.keys';

function isSaved(value: unknown): value is Saved {
  const v = value as Saved | null;
  return !!v && typeof v.hash === 'string' && typeof v.key === 'string';
}

export function createAttemptKeys(storage: AttemptStorage | null, newKey: () => string = () => crypto.randomUUID()): AttemptKeys {
  // Respaldo en memoria si el navegador bloquea el almacenamiento: dura lo que la página.
  let memory: Record<string, Saved> = {};

  const read = (): Record<string, Saved> => {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (!raw) return memory;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, Saved] => isSaved(entry[1])));
    } catch {
      return memory;
    }
  };

  const write = (saved: Record<string, Saved>) => {
    memory = saved;
    try {
      if (Object.keys(saved).length === 0) storage?.removeItem(STORAGE_KEY);
      else storage?.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      /* queda en memoria */
    }
  };

  return {
    keyFor(scope, content = null) {
      const hash = stableHash(content);
      const saved = read();
      if (saved[scope]?.hash === hash) return saved[scope].key;
      const key = newKey();
      write({ ...saved, [scope]: { hash, key } });
      return key;
    },
    forget(scope) {
      const { [scope]: _gone, ...rest } = read();
      write(rest);
    },
  };
}

function sessionStorageOrNull(): AttemptStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/** Las claves de la aplicación (una sola instancia). */
export const attemptKeys: AttemptKeys = createAttemptKeys(sessionStorageOrNull());
