// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type User } from '@/shared/api';
import { es } from '@/shared/i18n';
import { perfilViajero } from '@/shared/profile';

const api = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/api')>()), flightsApi: api }));

const USER: User = { id: 'u1', email: 'ana@example.test', roles: ['cliente'], scopes: ['flights:read'], createdAt: '2026-10-07T00:00:00Z' };
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: USER, authorized: <T,>(call: () => Promise<T>) => call(), logout: vi.fn() }) }));

import { ProfilePage } from './ProfilePage';

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const p = es.profile;

beforeEach(() => {
  localStorage.clear();
  api.me.mockReset().mockResolvedValue(USER);
});
afterEach(cleanup);

const renderPage = () =>
  render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>,
  );

describe('página Mi perfil', () => {
  it('un solo h1 y dos secciones: la cuenta (de la API) y los datos de viajero (de este dispositivo)', async () => {
    renderPage();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(await screen.findByText(USER.email)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: p.accountTitle })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: p.travelerTitle })).toBeTruthy();
    expect(screen.getByRole('form', { name: p.travelerTitle })).toBeTruthy();
  });

  it('si /auth/me falla, los datos de viajero se ven y se pueden editar igual (no dependen de la API)', async () => {
    api.me.mockRejectedValue(new ApiError({ status: 500 }));
    renderPage();
    expect(await screen.findByText(es.states.errorTitle)).toBeTruthy();
    expect(screen.getByLabelText(/^Nombres/)).toBeTruthy();
  });

  it('muestra el perfil guardado del usuario de la sesión', async () => {
    perfilViajero.save('u1', { firstName: 'Ana', lastName: 'Pérez', documentType: 'NATIONAL_ID', documentNumber: '1710034065', nationality: 'EC', gender: 'F', birthDate: '15/03/1990', documentExpiryDate: '', email: 'ana@example.test', phone: '991234567' });
    renderPage();
    expect((screen.getByLabelText(/^Nombres/) as HTMLInputElement).value).toBe('Ana');
    expect(screen.getByRole('button', { name: p.forget })).toBeTruthy();
  });

  it('nunca pide a la API los datos de viajero: el backend no tiene perfil', async () => {
    renderPage();
    await screen.findByText(USER.email);
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(Object.keys(api)).toEqual(['me']);
  });
});
