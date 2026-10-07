import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { es } from '@/shared/i18n';
import { ErrorState, LoadingState } from '@/shared/ui';
import { routes } from './routes';

/**
 * Rutas que exigen sesión (Mis viajes, Mi perfil). Mientras la sesión se restaura no decide nada
 * (ni muestra la página ni redirige); sin sesión lleva a /ingresar con `?volver=` para regresar
 * al mismo lugar después de ingresar o registrarse. Si la sesión guardada no se pudo restaurar por
 * un problema de conexión, no se trata como cerrada: se explica y se ofrece reintentar.
 */
export function RequireAuth() {
  const { status, restoreError, retryRestore } = useAuth();
  const { pathname, search, hash } = useLocation();
  if (status === 'restoring') {
    return <LoadingState label={es.session.restoring} className="container-page py-12" />;
  }
  if (status === 'unavailable') {
    return (
      <div className="container-page py-12">
        <ErrorState title={es.session.unavailable} error={restoreError} onRetry={() => void retryRestore()} />
      </div>
    );
  }
  if (status !== 'authenticated') return <Navigate to={routes.login(`${pathname}${search}${hash}`)} replace />;
  return <Outlet />;
}
