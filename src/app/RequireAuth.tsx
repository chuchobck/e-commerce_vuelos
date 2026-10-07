import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './providers/AuthProvider';
import { routes } from './routes';

/**
 * Rutas que exigen sesión (Mis viajes, Mi perfil). Sin sesión lleva a /ingresar
 * con `?volver=` para regresar al mismo lugar después de ingresar o registrarse.
 */
export function RequireAuth() {
  const { session } = useAuth();
  const { pathname, search, hash } = useLocation();
  if (!session) return <Navigate to={routes.login(`${pathname}${search}${hash}`)} replace />;
  return <Outlet />;
}
