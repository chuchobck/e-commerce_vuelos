import { describe, expect, it } from 'vitest';
import { createTokenStore, fingerprint, type StorageLike } from './tokenStore';

function memoryStorage(): StorageLike & { keys: () => string[] } {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    keys: () => [...data.keys()],
  };
}

describe('almacén del refresh token', () => {
  it('un solo lugar a la vez y la rotación respeta dónde estaba', () => {
    const session = memoryStorage();
    const local = memoryStorage();
    const store = createTokenStore(session, local);
    store.write('t1', true);
    expect([session.keys(), local.keys()]).toEqual([[], ['quinde.auth.refresh']]);
    store.replace('t2');
    expect(local.getItem('quinde.auth.refresh')).toBe('t2');
    expect(store.isPersistent()).toBe(true);
    store.write('t3', false);
    expect([session.getItem('quinde.auth.refresh'), local.getItem('quinde.auth.refresh')]).toEqual(['t3', null]);
    store.clear();
    expect(store.read()).toBeNull();
  });

  it('marca los tokens rotados por huella, sin guardarlos', () => {
    const local = memoryStorage();
    let now = 0;
    const store = createTokenStore(memoryStorage(), local, () => now);
    store.markRotated('un-token-secreto');
    expect(store.wasRotated('un-token-secreto')).toBe(true);
    expect(store.wasRotated('otro')).toBe(false);
    expect(local.getItem('quinde.auth.rotated')).not.toContain('un-token-secreto');
    now += 11 * 60_000;
    expect(store.wasRotated('un-token-secreto')).toBe(false);
  });

  it('sin almacenamiento disponible no rompe', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    const store = createTokenStore(broken, null);
    expect(() => store.write('t', false)).not.toThrow();
    expect(store.read()).toBeNull();
  });

  it('la huella es estable y corta', () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'));
    expect(fingerprint('abc')).not.toBe(fingerprint('abd'));
    expect(fingerprint('x'.repeat(43))).toMatch(/^[0-9a-f]{8}$/);
  });
});
