// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, matchRoutes, RouterProvider, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { RequireAuth } from './RequireAuth';
import { buildRoutes, legacyRoutes } from './routeTable';
import { legacyRedirects, paths, routes, safeReturnTo } from './routes';

afterEach(cleanup);

/** id de la ruta que atiende `pathname` (la más específica). */
function routeIdFor(pathname: string, dev = true) {
  const matches = matchRoutes(buildRoutes({ dev }), pathname);
  return matches?.[matches.length - 1].route.id;
}

/** La ruta pasa por RequireAuth. */
function guarded(pathname: string) {
  const matches = matchRoutes(buildRoutes({ dev: true }), pathname) ?? [];
  return matches.some((m) => (m.route.element as { type?: unknown } | undefined)?.type === RequireAuth);
}

describe('tabla de rutas', () => {
  const samples: Record<keyof typeof paths, string> = {
    home: routes.home(),
    results: routes.results('origen=UIO&destino=GYE'),
    offers: routes.offers(),
    checkoutDetails: routes.checkoutDetails(),
    checkoutPayment: routes.checkoutPayment(),
    checkoutConfirmation: routes.checkoutConfirmation('bkg_1'),
    trips: routes.trips(),
    trip: routes.trip('bkg_1'),
    tripTickets: routes.tripTickets('bkg_1'),
    tripCheckIn: routes.tripCheckIn('bkg_1'),
    tripPasses: routes.tripPasses('bkg_1'),
    tripBaggage: routes.tripBaggage('bkg_1'),
    tripDateChange: routes.tripDateChange('bkg_1'),
    tripCancel: routes.tripCancel('bkg_1'),
    flightStatus: routes.flightStatus(),
    login: routes.login(),
    register: routes.register(),
    profile: routes.profile(),
    help: routes.help('preguntas'),
    uiKit: paths.uiKit,
    uiKitSeats: paths.uiKitSeats,
  };

  it.each(Object.entries(samples))('%s se atiende en su ruta', (id, href) => {
    const pathname = href.split(/[?#]/)[0];
    expect(routeIdFor(pathname)).toBe(id);
  });

  it('las rutas de viaje y perfil exigen sesión (cuelgan de RequireAuth)', () => {
    for (const href of [routes.trips(), routes.trip('x'), routes.tripCheckIn('x'), routes.tripCancel('x'), routes.profile()]) {
      expect(guarded(href)).toBe(true);
    }
  });

  it('la compra exige sesión: sin ella se va a /ingresar y se vuelve a la compra', () => {
    for (const href of [routes.checkoutDetails(), routes.checkoutPayment(), routes.checkoutConfirmation('x')]) {
      expect(guarded(href)).toBe(true);
    }
  });

  it('/componentes solo existe en desarrollo', () => {
    expect(routeIdFor(paths.uiKit, true)).toBe('uiKit');
    expect(routeIdFor(paths.uiKit, false)).toBe('notFound');
  });

  it('una ruta desconocida cae en el 404', () => {
    expect(routeIdFor('/no-existe')).toBe('notFound');
  });

  it('codifica los ids en los enlaces', () => {
    expect(routes.trip('a/b')).toBe('/viajes/a%2Fb');
    expect(routes.tripCheckIn('bkg_1')).toBe('/viajes/bkg_1/check-in');
  });
});

describe('redirecciones de rutas viejas', () => {
  it.each([
    ['/mis-reservas', '/viajes'],
    ['/mis-viajes', '/viajes'],
    ['/mis-viajes/bkg_1', '/viajes/bkg_1'],
    ['/mis-viajes/bkg_1/check-in', '/viajes/bkg_1/check-in'],
    ['/mis-viajes/bkg_1/cancelar', '/viajes/bkg_1/cancelar'],
    ['/reserva/QD7K2M', '/viajes/QD7K2M'],
    ['/check-in', '/viajes'],
    ['/compra', '/compra/datos'],
  ])('%s → %s', async (from, to) => {
    expect(routeIdFor(from)?.startsWith('legacy:')).toBe(true);

    function Where() {
      return <p>{useLocation().pathname}</p>;
    }
    const router = createMemoryRouter([...legacyRoutes(), { path: '*', element: <Where /> }], { initialEntries: [from] });
    render(<RouterProvider router={router} />);
    expect(await screen.findByText(to)).toBeTruthy();
  });

  it('cubre todas las rutas viejas declaradas', () => {
    expect(legacyRedirects.map((r) => r.from).sort()).toEqual([
      '/check-in',
      '/compra',
      '/mis-reservas',
      '/mis-viajes',
      '/mis-viajes/:id',
      '/mis-viajes/:id/cambiar-fecha',
      '/mis-viajes/:id/cancelar',
      '/mis-viajes/:id/check-in',
      '/mis-viajes/:id/equipaje',
      '/mis-viajes/:id/pases',
      '/reserva/:id',
    ]);
  });
});

describe('safeReturnTo', () => {
  it('acepta rutas internas con query y ancla', () => {
    expect(safeReturnTo('/compra/datos')).toBe('/compra/datos');
    expect(safeReturnTo('/viajes/bkg_1?x=1#y')).toBe('/viajes/bkg_1?x=1#y');
  });

  it.each([null, '', 'https://evil.com', '//evil.com', '/\\evil.com', 'mis-viajes', '/ingresar', '/registrarse?volver=/x'])(
    'rechaza %s',
    (value) => {
      expect(safeReturnTo(value)).toBeNull();
    },
  );
});
