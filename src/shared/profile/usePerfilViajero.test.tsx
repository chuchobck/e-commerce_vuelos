// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { perfilViajero } from './perfilViajero';
import type { TravelerValues } from './traveler';
import { usePerfilViajero } from './usePerfilViajero';

const ANA: TravelerValues = { firstName: 'Ana', lastName: 'Pérez', documentType: 'NATIONAL_ID', documentNumber: '1710034065', nationality: 'EC', gender: 'F', birthDate: '15/03/1990', documentExpiryDate: '', email: 'ana@example.test', phone: '991234567' };

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('usePerfilViajero', () => {
  it('sin usuario o sin perfil: nada guardado', () => {
    expect(renderHook(() => usePerfilViajero(undefined)).result.current).toEqual({ profile: null, saved: false, complete: false });
    expect(renderHook(() => usePerfilViajero('u1')).result.current).toEqual({ profile: null, saved: false, complete: false });
  });

  it('se actualiza solo al guardar y al borrar', () => {
    const { result } = renderHook(() => usePerfilViajero('u1'));
    act(() => void perfilViajero.save('u1', ANA));
    expect(result.current).toMatchObject({ saved: true, complete: true, profile: { firstName: 'Ana' } });
    act(() => void perfilViajero.remove('u1'));
    expect(result.current.saved).toBe(false);
  });

  it('un perfil incompleto está guardado pero no completo', () => {
    act(() => void perfilViajero.save('u1', { ...ANA, phone: '' }));
    const { result } = renderHook(() => usePerfilViajero('u1'));
    expect(result.current).toMatchObject({ saved: true, complete: false });
  });

  it('cada usuario ve solo lo suyo', () => {
    act(() => void perfilViajero.save('u1', ANA));
    expect(renderHook(() => usePerfilViajero('u2')).result.current.saved).toBe(false);
    expect(renderHook(() => usePerfilViajero('u1')).result.current.saved).toBe(true);
  });

  it('un cambio hecho en otra pestaña (evento storage) se refleja', () => {
    const { result } = renderHook(() => usePerfilViajero('u1'));
    localStorage.setItem('quinde.perfil.v1:u1', JSON.stringify({ version: 1, data: ANA }));
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: 'quinde.perfil.v1:u1' })));
    expect(result.current.saved).toBe(true);
  });
});
