import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { routes, safeReturnTo } from '@/app/routes';
import { useAuth } from '@/features/auth';
import { es } from '@/shared/i18n';
import { toast } from '@/shared/ui';

/**
 * Cuando la sesión termina sola:
 * - por seguridad (refresh token vencido o reutilizado): aviso y a /ingresar conservando `volver`
 *   (la selección de compra vive en sessionStorage y no se toca);
 * - en otra pestaña: solo el aviso (las páginas protegidas ya redirigen con RequireAuth).
 */
export function SessionNotices() {
  const { ended } = useAuth();
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (ended === 'security') {
      toast({ title: es.session.expired, variant: 'error' });
      navigate(routes.login(safeReturnTo(`${pathname}${search}${hash}`) ?? undefined), { replace: true });
    } else if (ended === 'elsewhere') {
      toast({ title: es.session.endedElsewhere });
    }
    // Solo cuando cambia el motivo: navegar después no debe repetir el aviso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended]);

  return null;
}
