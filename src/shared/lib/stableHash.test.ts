import { describe, expect, it } from 'vitest';
import { stableHash, stableStringify } from './stableHash';

describe('stableStringify / stableHash', () => {
  it('el orden de las claves no importa; el de los arreglos sí', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, 4] } })).toBe('{"a":{"c":[3,4],"d":2},"b":1}');
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
    expect(stableHash([1, 2])).not.toBe(stableHash([2, 1]));
  });

  it('omite undefined como JSON.stringify y distingue cualquier cambio de valor', () => {
    expect(stableHash({ a: 1, b: undefined })).toBe(stableHash({ a: 1 }));
    expect(stableHash({ a: 'PAY-OK-AAAA' })).not.toBe(stableHash({ a: 'PAY-OK-AAAB' }));
    expect(stableHash({ a: 1 })).toMatch(/^[0-9a-f]{14}$/);
  });
});
