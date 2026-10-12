import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from './http/client';
import { RealFlightsApi } from './RealFlightsApi';
import type { Credentials } from './types';

/**
 * El registro con datos de viajero NO cambia lo que recibe la API: `POST /auth/register` solo acepta correo y
 * contraseña (el backend no tiene perfil). Aunque a la función le lleguen más datos, al cuerpo solo pasan esos dos.
 */
describe('POST /auth/register: solo correo y contraseña', () => {
  const USER_DTO = { id: 'u1', email: 'ana@example.test', roles: ['cliente'], scopes: [], createdAt: '2026-10-12T00:00:00Z' };

  it('API real: el cuerpo es exactamente {email, password}, sin datos de viajero ni roles', async () => {
    const request = vi.fn(async () => USER_DTO);
    const api = new RealFlightsApi({ request } as unknown as HttpClient);
    const withExtras = { email: 'ana@example.test', password: 'una frase larga de prueba', firstName: 'Ana', documentNumber: '1710034065', roles: ['admin'] } as Credentials;
    await api.register(withExtras);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith('POST', '/auth/register', { body: { email: 'ana@example.test', password: 'una frase larga de prueba' } });
    const [, , options] = request.mock.calls[0] as unknown as [string, string, { body: object }];
    expect(Object.keys(options.body).sort()).toEqual(['email', 'password']);
  });

  it('mock: tampoco guarda ni devuelve datos de viajero (la cuenta es solo correo y contraseña)', async () => {
    vi.stubEnv('VITE_MOCK_ERROR_RATE', '0');
    vi.resetModules();
    const { MockFlightsApi } = await import('./mock/MockFlightsApi');
    const api = new MockFlightsApi(() => undefined);
    const user = await api.register({ email: 'luis@example.test', password: 'una frase larga de prueba', firstName: 'Luis', documentNumber: '1710034065' } as Credentials);
    expect(Object.keys(user).sort()).toEqual(['createdAt', 'email', 'id', 'roles', 'scopes']);
    expect(JSON.stringify(user)).not.toMatch(/Luis|1710034065/);
    vi.unstubAllEnvs();
  });
});
