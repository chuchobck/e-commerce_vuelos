import { createBrowserRouter } from 'react-router-dom';
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
import { UiKitPage } from '@/pages/UiKitPage';
import { RootLayout } from './layout/RootLayout';
import { RouteErrorPage } from './layout/RouteErrorPage';

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
      { path: '/componentes', element: <UiKitPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
