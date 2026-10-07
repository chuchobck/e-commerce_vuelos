import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTtlCache } from './ttlCache';

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe('caché con vencimiento', () => {
  let now = 0;
  const clock = () => now;

  beforeEach(() => {
    now = 1_000;
    vi.stubGlobal('sessionStorage', fakeStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('devuelve lo guardado hasta que vence', () => {
    const cache = createTtlCache<number>('t', 10_000, clock);
    cache.set('a', 1);
    now += 9_999;
    expect(cache.get('a')).toBe(1);
    now += 1;
    expect(cache.get('a')).toBeUndefined();
  });

  it('sobrevive a refrescar la página (sessionStorage)', () => {
    createTtlCache<number>('t', 10_000, clock).set('a', 7);
    expect(createTtlCache<number>('t', 10_000, clock).get('a')).toBe(7);
  });

  it('carga una sola vez aunque se pida en paralelo, y después sirve de la caché', async () => {
    const cache = createTtlCache<string>('t', 10_000, clock);
    const load = vi.fn(async () => 'valor');
    const [a, b] = await Promise.all([cache.getOrLoad('k', load), cache.getOrLoad('k', load)]);
    await cache.getOrLoad('k', load);
    expect([a, b]).toEqual(['valor', 'valor']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('un error nunca queda en caché', async () => {
    const cache = createTtlCache<string>('t', 10_000, clock);
    await expect(cache.getOrLoad('k', () => Promise.reject(new Error('429')))).rejects.toThrow('429');
    await expect(cache.getOrLoad('k', async () => 'ok')).resolves.toBe('ok');
  });
});
