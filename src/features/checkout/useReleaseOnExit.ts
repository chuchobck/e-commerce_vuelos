import { useEffect, useRef } from 'react';
import { paths } from '@/app/routes';
import { checkout } from './instance';

const inFlow = (pathname: string) => pathname === paths.checkoutDetails || pathname === paths.checkoutPayment;
/** Ir a ingresar o registrarse desde el paso 2 es parte de la compra; la confirmación es el final. */
const staysInPurchase = (pathname: string) =>
  inFlow(pathname) || pathname === paths.login || pathname === paths.register || pathname.startsWith(paths.checkoutConfirmation.replace(':id', ''));

/**
 * Salir de la compra a otra sección (header, Mis viajes, resultados…) es salir voluntariamente:
 * se libera el hold (mejor esfuerzo), conservando la selección y lo escrito.
 *
 * No se libera al recargar ni al cerrar la pestaña (`pagehide`): el navegador no distingue una
 * recarga de un cierre, y recargar debe reutilizar el hold. Si se cierra, el hold vence solo
 * (≤ 15 minutos) y la API devuelve el cupo.
 */
export function useReleaseOnExit(pathname: string): void {
  const previous = useRef(pathname);
  useEffect(() => {
    const was = previous.current;
    previous.current = pathname;
    if (inFlow(was) && !staysInPurchase(pathname)) void checkout.leave();
  }, [pathname]);
}
