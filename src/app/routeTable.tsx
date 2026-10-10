import type { ComponentType } from 'react';
import { Navigate, useParams, type RouteObject } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';
import { RootLayout } from './layout/RootLayout';
import { RouteLoading } from './layout/RouteLoading';
import { RouteErrorPage } from './layout/RouteErrorPage';
import { RequireAuth } from './RequireAuth';
import { legacyRedirects, paths } from './routes';

/**
 * Cada página va en su propio archivo JS y se descarga al entrar en su ruta (el inicio, que es la entrada habitual, va en el
 * paquete principal). Así la primera carga no trae el código de la compra, de Mis viajes ni del resto.
 */
function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K): Pick<RouteObject, 'lazy'> {
  return { lazy: async () => ({ Component: (await load())[name] }) };
}

function LegacyRedirect({ to }: { to: (params: { id?: string }) => string }) {
  return <Navigate to={to(useParams())} replace />;
}

/** Redirecciones de las rutas de la fase 0 (ver `legacyRedirects`). */
export function legacyRoutes(): RouteObject[] {
  return legacyRedirects.map(({ from, to }) => ({ id: `legacy:${from}`, path: from, element: <LegacyRedirect to={to} /> }));
}

/**
 * Tabla de rutas de la aplicación (README, sección 4). Cada ruta lleva como `id` su clave en `paths`.
 * `/compra/*` exige sesión: quien no ha ingresado va a /ingresar y vuelve a la compra con su selección intacta.
 */
export function buildRoutes({ dev }: { dev: boolean }): RouteObject[] {
  // `import.meta.env.DEV` va primero para que la compilación de producción descarte el catálogo.
  const devRoutes: RouteObject[] =
    import.meta.env.DEV && dev
      ? [
          { id: 'uiKit', path: paths.uiKit, ...lazyPage(() => import('@/pages/UiKitPage'), 'UiKitPage') },
          {
            id: 'uiKitSeats',
            path: paths.uiKitSeats,
            ...lazyPage(() => import('@/pages/SeatsDemoPage'), 'SeatsDemoPage'),
          },
        ]
      : [];

  return [
    {
      element: <RootLayout />,
      HydrateFallback: RouteLoading,
      errorElement: <RouteErrorPage />,
      children: [
        { id: 'home', path: paths.home, element: <HomePage /> },
        { id: 'results', path: paths.results, ...lazyPage(() => import('@/pages/ResultsPage'), 'ResultsPage') },
        { id: 'offers', path: paths.offers, ...lazyPage(() => import('@/pages/OffersPage'), 'OffersPage') },
        {
          element: <RequireAuth />,
          children: [
            { id: 'checkoutDetails', path: paths.checkoutDetails, ...lazyPage(() => import('@/pages/CheckoutDetailsPage'), 'CheckoutDetailsPage') },
            { id: 'checkoutPayment', path: paths.checkoutPayment, ...lazyPage(() => import('@/pages/CheckoutPaymentPage'), 'CheckoutPaymentPage') },
            { id: 'checkoutConfirmation', path: paths.checkoutConfirmation, ...lazyPage(() => import('@/pages/CheckoutConfirmationPage'), 'CheckoutConfirmationPage') },
            { id: 'trips', path: paths.trips, ...lazyPage(() => import('@/pages/TripsPage'), 'TripsPage') },
            { id: 'trip', path: paths.trip, ...lazyPage(() => import('@/pages/TripPage'), 'TripPage') },
            { id: 'tripTickets', path: paths.tripTickets, ...lazyPage(() => import('@/pages/TripTicketsPage'), 'TripTicketsPage') },
            { id: 'tripCheckIn', path: paths.tripCheckIn, ...lazyPage(() => import('@/pages/TripCheckInPage'), 'TripCheckInPage') },
            // Los pases cargan aparte (trae el dibujo del QR): nadie los necesita antes del check-in.
            { id: 'tripPasses', path: paths.tripPasses, ...lazyPage(() => import('@/pages/TripPassesPage'), 'TripPassesPage') },
            { id: 'tripBaggage', path: paths.tripBaggage, ...lazyPage(() => import('@/pages/TripBaggagePage'), 'TripBaggagePage') },
            { id: 'tripDateChange', path: paths.tripDateChange, ...lazyPage(() => import('@/pages/TripDateChangePage'), 'TripDateChangePage') },
            { id: 'tripCancel', path: paths.tripCancel, ...lazyPage(() => import('@/pages/TripCancelPage'), 'TripCancelPage') },
            { id: 'profile', path: paths.profile, ...lazyPage(() => import('@/pages/ProfilePage'), 'ProfilePage') },
          ],
        },
        { id: 'flightStatus', path: paths.flightStatus, ...lazyPage(() => import('@/pages/FlightStatusPage'), 'FlightStatusPage') },
        { id: 'login', path: paths.login, ...lazyPage(() => import('@/pages/LoginPage'), 'LoginPage') },
        { id: 'register', path: paths.register, ...lazyPage(() => import('@/pages/RegisterPage'), 'RegisterPage') },
        { id: 'help', path: paths.help, ...lazyPage(() => import('@/pages/HelpPage'), 'HelpPage') },
        ...legacyRoutes(),
        ...devRoutes,
        { id: 'notFound', path: '*', ...lazyPage(() => import('@/pages/NotFoundPage'), 'NotFoundPage') },
      ],
    },
  ];
}
