import { Navigate, useParams, type RouteObject } from 'react-router-dom';
import { CheckoutConfirmationPage } from '@/pages/CheckoutConfirmationPage';
import { CheckoutDetailsPage } from '@/pages/CheckoutDetailsPage';
import { CheckoutPaymentPage } from '@/pages/CheckoutPaymentPage';
import { FlightStatusPage } from '@/pages/FlightStatusPage';
import { HelpPage } from '@/pages/HelpPage';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { OffersPage } from '@/pages/OffersPage';
import { ProfilePage } from '@/pages/ProfilePage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ResultsPage } from '@/pages/ResultsPage';
import { TripCancelPage } from '@/pages/TripCancelPage';
import { TripCheckInPage } from '@/pages/TripCheckInPage';
import { TripPage } from '@/pages/TripPage';
import { TripSoonPage } from '@/pages/TripSoonPage';
import { TripsPage } from '@/pages/TripsPage';
import { RootLayout } from './layout/RootLayout';
import { RouteErrorPage } from './layout/RouteErrorPage';
import { RequireAuth } from './RequireAuth';
import { legacyRedirects, paths } from './routes';

function LegacyRedirect({ to }: { to: (params: { id?: string }) => string }) {
  return <Navigate to={to(useParams())} replace />;
}

/** Redirecciones de las rutas de la fase 0 (ver `legacyRedirects`). */
export function legacyRoutes(): RouteObject[] {
  return legacyRedirects.map(({ from, to }) => ({ id: `legacy:${from}`, path: from, element: <LegacyRedirect to={to} /> }));
}

/**
 * Tabla de rutas de la aplicación (README, sección 4). Cada ruta lleva como `id` su clave en `paths`.
 * `/compra/*` no exige sesión a propósito: el ingreso ocurre dentro del paso 2.
 */
export function buildRoutes({ dev }: { dev: boolean }): RouteObject[] {
  // `import.meta.env.DEV` va primero para que la compilación de producción descarte el catálogo.
  const devRoutes: RouteObject[] =
    import.meta.env.DEV && dev
      ? [
          { id: 'uiKit', path: paths.uiKit, lazy: async () => ({ Component: (await import('@/pages/UiKitPage')).UiKitPage }) },
          {
            id: 'uiKitSeats',
            path: paths.uiKitSeats,
            lazy: async () => ({ Component: (await import('@/pages/SeatsDemoPage')).SeatsDemoPage }),
          },
        ]
      : [];

  return [
    {
      element: <RootLayout />,
      errorElement: <RouteErrorPage />,
      children: [
        { id: 'home', path: paths.home, element: <HomePage /> },
        { id: 'results', path: paths.results, element: <ResultsPage /> },
        { id: 'offers', path: paths.offers, element: <OffersPage /> },
        { id: 'checkoutDetails', path: paths.checkoutDetails, element: <CheckoutDetailsPage /> },
        { id: 'checkoutPayment', path: paths.checkoutPayment, element: <CheckoutPaymentPage /> },
        { id: 'checkoutConfirmation', path: paths.checkoutConfirmation, element: <CheckoutConfirmationPage /> },
        {
          element: <RequireAuth />,
          children: [
            { id: 'trips', path: paths.trips, element: <TripsPage /> },
            { id: 'trip', path: paths.trip, element: <TripPage /> },
            { id: 'tripCheckIn', path: paths.tripCheckIn, element: <TripCheckInPage /> },
            { id: 'tripPasses', path: paths.tripPasses, element: <TripSoonPage kind="passes" /> },
            { id: 'tripBaggage', path: paths.tripBaggage, element: <TripSoonPage kind="baggage" /> },
            { id: 'tripDateChange', path: paths.tripDateChange, element: <TripSoonPage kind="dateChange" /> },
            { id: 'tripCancel', path: paths.tripCancel, element: <TripCancelPage /> },
            { id: 'profile', path: paths.profile, element: <ProfilePage /> },
          ],
        },
        { id: 'flightStatus', path: paths.flightStatus, element: <FlightStatusPage /> },
        { id: 'login', path: paths.login, element: <LoginPage /> },
        { id: 'register', path: paths.register, element: <RegisterPage /> },
        { id: 'help', path: paths.help, element: <HelpPage /> },
        ...legacyRoutes(),
        ...devRoutes,
        { id: 'notFound', path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}
