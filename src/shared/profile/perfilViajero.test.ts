import { describe, expect, it, vi } from 'vitest';
import { createPerfilViajero, parseStoredProfile, type PerfilStorage } from './perfilViajero';
import { emptyTraveler, TRAVELER_KEYS, type TravelerValues } from './traveler';

const ANA: TravelerValues = { firstName: 'Ana', lastName: 'Pérez', documentType: 'NATIONAL_ID', documentNumber: '1710034065', nationality: 'EC', gender: 'F', birthDate: '15/03/1990', documentExpiryDate: '', email: 'ana@example.test', phone: '991234567' };

function memory(): PerfilStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

/** Un almacenamiento que lanza en todo (modo privado, cuota llena, bloqueado por el navegador). */
const broken = (): PerfilStorage => ({
  getItem: () => {
    throw new Error('bloqueado');
  },
  setItem: () => {
    throw new Error('cuota');
  },
  removeItem: () => {
    throw new Error('bloqueado');
  },
});

function service() {
  const local = memory();
  const session = memory();
  return { local, session, perfil: createPerfilViajero({ local: () => local, session: () => session }) };
}

describe('perfilViajero: guardar y leer por usuario', () => {
  it('guarda y devuelve los mismos datos', () => {
    const { perfil } = service();
    expect(perfil.read('u1')).toBeNull();
    expect(perfil.save('u1', ANA)).toBe(true);
    expect(perfil.read('u1')).toEqual(ANA);
  });

  it('la clave es por usuario: cada uno ve lo suyo y borrar uno no toca al otro', () => {
    const { local, perfil } = service();
    perfil.save('u1', ANA);
    perfil.save('u2', { ...ANA, firstName: 'Luis' });
    expect(perfil.read('u1')?.firstName).toBe('Ana');
    expect(perfil.read('u2')?.firstName).toBe('Luis');
    expect([...local.data.keys()].sort()).toEqual(['quinde.perfil.v1:u1', 'quinde.perfil.v1:u2']);
    expect(perfil.remove('u1')).toBe(true);
    expect(perfil.read('u1')).toBeNull();
    expect(perfil.read('u2')?.firstName).toBe('Luis');
  });

  it('sin usuario no lee ni guarda nada', () => {
    const { local, perfil } = service();
    expect(perfil.save(undefined, ANA)).toBe(false);
    expect(perfil.save('', ANA)).toBe(false);
    expect(perfil.read(null)).toBeNull();
    expect(perfil.remove(undefined)).toBe(false);
    expect(local.data.size).toBe(0);
  });

  it('solo guarda la lista cerrada de campos: una contraseña o un token que se cuele no llega al almacenamiento', () => {
    const { local, perfil } = service();
    perfil.save('u1', { ...ANA, password: 'una frase larga de prueba', accessToken: 'a.b.c', refreshToken: 'r'.repeat(43) } as unknown as TravelerValues);
    const stored = local.data.get('quinde.perfil.v1:u1') ?? '';
    expect(Object.keys((JSON.parse(stored) as { data: object }).data).sort()).toEqual([...TRAVELER_KEYS].sort());
    expect(stored).not.toMatch(/password|accessToken|refreshToken|una frase larga|a\.b\.c/);
  });

  it('no usa sessionStorage para el perfil (solo para recordar que se descartó el aviso)', () => {
    const { session, perfil } = service();
    perfil.save('u1', ANA);
    expect(session.data.size).toBe(0);
  });
});

describe('perfilViajero: lo guardado no es de fiar', () => {
  it('JSON dañado, de otra versión o que no es un objeto: no hay perfil y no se rompe nada', () => {
    expect(parseStoredProfile('{no es json')).toBeNull();
    expect(parseStoredProfile('null')).toBeNull();
    expect(parseStoredProfile('"texto"')).toBeNull();
    expect(parseStoredProfile(JSON.stringify({ version: 2, data: ANA }))).toBeNull();
    expect(parseStoredProfile(JSON.stringify({ version: 1 }))).toBeNull();
    expect(parseStoredProfile(null)).toBeNull();
  });

  it('descarta campos que no son texto o son enormes, y los valores fuera de catálogo vuelven al vacío', () => {
    const raw = JSON.stringify({ version: 1, data: { ...ANA, firstName: 42, lastName: 'x'.repeat(500), documentType: 'LICENCIA', gender: 'Z', extra: 'ignorado' } });
    const profile = parseStoredProfile(raw);
    expect(profile).toMatchObject({ firstName: '', lastName: '', documentType: 'NATIONAL_ID', gender: '', documentNumber: '1710034065' });
    expect(profile).not.toHaveProperty('extra');
  });

  it('un perfil con campos que faltan se completa con vacíos (Ecuador y cédula por defecto)', () => {
    const profile = parseStoredProfile(JSON.stringify({ version: 1, data: { firstName: 'Ana' } }));
    expect(profile).toEqual({ ...emptyTraveler(), firstName: 'Ana' });
  });
});

describe('perfilViajero: sin almacenamiento la app sigue funcionando', () => {
  it('si el almacenamiento lanza, nada se rompe: lee null y guardar y borrar responden false', () => {
    const perfil = createPerfilViajero({ local: broken, session: broken });
    expect(perfil.read('u1')).toBeNull();
    expect(perfil.raw('u1')).toBeNull();
    expect(perfil.save('u1', ANA)).toBe(false);
    expect(perfil.remove('u1')).toBe(false);
    expect(perfil.noticeDismissed('u1')).toBe(false);
    expect(() => perfil.dismissNotice('u1')).not.toThrow();
  });

  it('si ni siquiera existe el almacenamiento (null), tampoco', () => {
    const perfil = createPerfilViajero({ local: () => null, session: () => null });
    expect(perfil.read('u1')).toBeNull();
    expect(perfil.save('u1', ANA)).toBe(false);
    expect(perfil.remove('u1')).toBe(true); // no hay nada que borrar
    expect(perfil.noticeDismissed('u1')).toBe(false);
  });

  it('si la cuota se llena al guardar, dice false y no deja a medias el perfil anterior', () => {
    const local = memory();
    const perfil = createPerfilViajero({ local: () => local, session: () => memory() });
    perfil.save('u1', ANA);
    local.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    expect(perfil.save('u1', { ...ANA, firstName: 'Otra' })).toBe(false);
    expect(perfil.read('u1')?.firstName).toBe('Ana');
  });
});

describe('perfilViajero: avisos y aviso de «Completa tu perfil»', () => {
  it('avisa a quien escucha al guardar y al borrar, y deja de avisar al darse de baja', () => {
    const { perfil } = service();
    const listener = vi.fn();
    const off = perfil.subscribe(listener);
    perfil.save('u1', ANA);
    perfil.remove('u1');
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    perfil.save('u1', ANA);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('el aviso descartado se recuerda por usuario y por sesión del navegador', () => {
    const { session, perfil } = service();
    expect(perfil.noticeDismissed('u1')).toBe(false);
    perfil.dismissNotice('u1');
    expect(perfil.noticeDismissed('u1')).toBe(true);
    expect(perfil.noticeDismissed('u2')).toBe(false);
    expect(session.data.size).toBe(1);
  });
});
