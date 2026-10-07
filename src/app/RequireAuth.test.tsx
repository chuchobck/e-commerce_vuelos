// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuthSession } from '@/shared/api';
import { AuthProvider } from './providers/AuthProvider';
import { RequireAuth } from './RequireAuth';
import { paths, RETURN_TO_PARAM, safeReturnTo } from './routes';

const SESSION: AuthSession = {
  token: 'tok_test',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  user: {
    id: 'usr_test',
    email: 'maria@correo.com',
    firstName: 'María',
    lastName: 'Andrade',
    documentType: 'CEDULA',
    documentNumber: '1710034065',
    phone: '991234567',
  },
};

function LoginProbe() {
  const { search } = useLocation();
  return <p data-testid="login">{new URLSearchParams(search).get(RETURN_TO_PARAM)}</p>;
}

function renderAt(url: string) {
  const router = createMemoryRouter(
    [
      { element: <RequireAuth />, children: [{ path: '/mis-viajes/*', element: <p>Privado</p> }] },
      { path: paths.login, element: <LoginProbe /> },
    ],
    { initialEntries: [url] },
  );
  render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('RequireAuth', () => {
  it('sin sesión manda a /ingresar guardando a dónde iba (ruta, query y ancla)', async () => {
    renderAt('/mis-viajes/bkg_1/check-in?x=1#pases');
    const returnTo = (await screen.findByTestId('login')).textContent;
    expect(returnTo).toBe('/mis-viajes/bkg_1/check-in?x=1#pases');
    // La página de ingreso acepta ese destino y vuelve ahí al terminar.
    expect(safeReturnTo(returnTo)).toBe('/mis-viajes/bkg_1/check-in?x=1#pases');
  });

  it('con sesión muestra la página protegida', async () => {
    localStorage.setItem('quinde.session', JSON.stringify(SESSION));
    renderAt('/mis-viajes');
    expect(await screen.findByText('Privado')).toBeTruthy();
    expect(screen.queryByTestId('login')).toBeNull();
  });

  it('una sesión vencida cuenta como sin sesión', async () => {
    localStorage.setItem('quinde.session', JSON.stringify({ ...SESSION, expiresAt: new Date(Date.now() - 1000).toISOString() }));
    renderAt('/mis-viajes');
    expect((await screen.findByTestId('login')).textContent).toBe('/mis-viajes');
  });
});
