/**
 * Caché con vencimiento en memoria y en sessionStorage (sobrevive a refrescar la página).
 * Solo guarda resultados exitosos: un error nunca queda en caché.
 */
interface Entry<T> {
  value: T;
  expiresAt: number;
}

export interface TtlCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  /** Devuelve lo guardado o ejecuta `load` (una sola vez si hay llamadas simultáneas). */
  getOrLoad(key: string, load: () => Promise<T>): Promise<T>;
  clear(): void;
}

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function createTtlCache<T>(namespace: string, ttlMs: number, now: () => number = Date.now): TtlCache<T> {
  const memory = new Map<string, Entry<T>>();
  const pending = new Map<string, Promise<T>>();
  const storageKey = (key: string) => `${namespace}:${key}`;

  function read(key: string): Entry<T> | undefined {
    const inMemory = memory.get(key);
    if (inMemory) return inMemory;
    try {
      const raw = storage()?.getItem(storageKey(key));
      if (!raw) return undefined;
      const entry = JSON.parse(raw) as Entry<T>;
      memory.set(key, entry);
      return entry;
    } catch {
      return undefined;
    }
  }

  const cache: TtlCache<T> = {
    get(key) {
      const entry = read(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        memory.delete(key);
        try {
          storage()?.removeItem(storageKey(key));
        } catch {
          /* sin almacenamiento */
        }
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      const entry = { value, expiresAt: now() + ttlMs };
      memory.set(key, entry);
      try {
        storage()?.setItem(storageKey(key), JSON.stringify(entry));
      } catch {
        /* sin almacenamiento: queda en memoria */
      }
    },
    async getOrLoad(key, load) {
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
      const inFlight = pending.get(key);
      if (inFlight) return inFlight;
      const promise = load()
        .then((value) => {
          cache.set(key, value);
          return value;
        })
        .finally(() => pending.delete(key));
      pending.set(key, promise);
      return promise;
    },
    clear() {
      memory.clear();
      pending.clear();
    },
  };
  return cache;
}
