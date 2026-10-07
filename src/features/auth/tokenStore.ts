/**
 * Dónde vive el refresh token. El access token NUNCA se guarda: vive solo en memoria (session.ts).
 *
 * - Por defecto en sessionStorage: dura lo que la pestaña y no la comparten otras pestañas.
 * - En localStorage solo si el usuario marcó "Mantener mi sesión iniciada".
 * Nunca cookies propias, nunca en la URL, nunca en logs.
 */
const KEY = 'quinde.auth.refresh';
/** Huellas (no los tokens) de refresh tokens ya rotados, para no reusar una copia vieja. */
const ROTATED_KEY = 'quinde.auth.rotated';
const ROTATED_TTL_MS = 10 * 60_000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface TokenStore {
  read(): string | null;
  /** `persistent` = localStorage ("Mantener mi sesión iniciada"); si no, sessionStorage. */
  write(token: string, persistent: boolean): void;
  /** Reemplaza el token donde ya estaba guardado (tras una rotación). */
  replace(token: string): void;
  isPersistent(): boolean;
  clear(): void;
  markRotated(token: string): void;
  wasRotated(token: string): boolean;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Huella corta y no reversible (FNV-1a de 32 bits): identifica un token sin guardarlo. */
export function fingerprint(token: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function createTokenStore(session: StorageLike | null, local: StorageLike | null, now: () => number = Date.now): TokenStore {
  const readRotated = (): { fp: string; at: number }[] =>
    safe(() => (JSON.parse(local?.getItem(ROTATED_KEY) ?? '[]') as { fp: string; at: number }[]).filter((r) => now() - r.at < ROTATED_TTL_MS), []);

  const store: TokenStore = {
    read: () => safe(() => session?.getItem(KEY) ?? local?.getItem(KEY) ?? null, null),
    isPersistent: () => safe(() => !session?.getItem(KEY) && !!local?.getItem(KEY), false),
    write(token, persistent) {
      safe(() => {
        // Un solo lugar a la vez: si cambia la preferencia, se borra del otro.
        (persistent ? session : local)?.removeItem(KEY);
        (persistent ? local : session)?.setItem(KEY, token);
      }, undefined);
    },
    replace(token) {
      store.write(token, store.isPersistent());
    },
    clear() {
      safe(() => {
        session?.removeItem(KEY);
        local?.removeItem(KEY);
      }, undefined);
    },
    markRotated(token) {
      safe(() => local?.setItem(ROTATED_KEY, JSON.stringify([...readRotated(), { fp: fingerprint(token), at: now() }])), undefined);
    },
    wasRotated: (token) => readRotated().some((r) => r.fp === fingerprint(token)),
  };
  return store;
}
