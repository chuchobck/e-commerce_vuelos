import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { BookingPage } from '@/pages/BookingPage';
import { CheckInPage } from '@/pages/CheckInPage';
import { FlightStatusPage } from '@/pages/FlightStatusPage';
import { HelpPage } from '@/pages/HelpPage';
import { HomePage } from '@/pages/HomePage';
import { LoginPage } from '@/pages/LoginPage';
import { MyBookingsPage } from '@/pages/MyBookingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { PurchasePage } from '@/pages/PurchasePage';
import { RegisterPage } from '@/pages/RegisterPage';
import { ResultsPage } from '@/pages/ResultsPage';
import { RootLayout } from './layout/RootLayout';
import { RouteErrorPage } from './layout/RouteErrorPage';

/** Catálogo interno de componentes: solo existe en desarrollo. En producción la ruta cae en el 404 y el código ni se empaqueta. */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: '/componentes', lazy: async () => ({ Component: (await import('@/pages/UiKitPage')).UiKitPage }) }]
  : [];

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/resultados', element: <ResultsPage /> },
      { path: '/compra', element: <PurchasePage /> },
      { path: '/reserva/:id', element: <BookingPage /> },
      { path: '/mis-reservas', element: <MyBookingsPage /> },
      { path: '/check-in', element: <CheckInPage /> },
      { path: '/estado-vuelo', element: <FlightStatusPage /> },
      { path: '/ingresar', element: <LoginPage /> },
      { path: '/registrarse', element: <RegisterPage /> },
      { path: '/ayuda', element: <HelpPage /> },
      ...devRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
