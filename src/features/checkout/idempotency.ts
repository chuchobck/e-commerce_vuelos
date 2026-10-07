import { stableHash } from '@/shared/lib/stableHash';

/**
 * Claves de idempotencia de la compra: UNA por intención.
 *
 * - Hold: la intención es la selección (oferta + itinerarios + familias + desglose de pasajeros).
 * - Reserva: el hold + el contenido del pedido (pasajeros y referencia de pago).
 *
 * El mismo contenido devuelve la misma clave (un reintento tras un error de red o un doble clic no
 * crea un segundo hold ni una segunda reserva: la API repite la respuesta). Si el contenido cambia,
 * la clave es nueva: nunca se reusa una clave con otro cuerpo (la API respondería 422).
 * Se guarda solo la huella del contenido, nunca el contenido (lleva datos personales).
 */
export type IntentScope = 'hold' | 'booking';

export interface IntentKey {
  /** Huella del contenido (stableHash). */
  hash: string;
  /** UUID que viaja en Idempotency-Key. */
  key: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type Saved = Partial<Record<IntentScope, IntentKey>>;

const STORAGE_KEY = 'quinde.checkout.keys';

export interface IntentKeys {
  /** Clave para este contenido: la guardada si es el mismo, o una nueva (que reemplaza a la anterior). */
  keyFor(scope: IntentScope, content: unknown): string;
  /** La intención terminó (hold vencido, liberado o usado): el mismo contenido tendrá clave nueva. */
  forget(scope: IntentScope): void;
  /** Compra terminada o cancelada. */
  clear(): void;
}

function isIntentKey(value: unknown): value is IntentKey {
  const v = value as IntentKey | null;
  return !!v && typeof v.hash === 'string' && typeof v.key === 'string';
}

export function createIntentKeys(storage: StorageLike | null, newKey: () => string = () => crypto.randomUUID()): IntentKeys {
  // Respaldo en memoria si el navegador bloquea el almacenamiento: dura lo que la página.
  let memory: Saved = {};

  const read = (): Saved => {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (!raw) return memory;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Saved = {};
      for (const scope of ['hold', 'booking'] as const) if (isIntentKey(parsed[scope])) out[scope] = parsed[scope];
      return out;
    } catch {
      return memory;
    }
  };

  const write = (saved: Saved) => {
    memory = saved;
    try {
      if (Object.keys(saved).length === 0) storage?.removeItem(STORAGE_KEY);
      else storage?.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      /* queda en memoria */
    }
  };

  return {
    keyFor(scope, content) {
      const hash = stableHash(content);
      const saved = read();
      const current = saved[scope];
      if (current?.hash === hash) return current.key;
      const key = newKey();
      write({ ...saved, [scope]: { hash, key } });
      return key;
    },
    forget(scope) {
      const { [scope]: _gone, ...rest } = read();
      write(rest);
    },
    clear() {
      write({});
    },
  };
}
