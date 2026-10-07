import { Plane, PlaneTakeoff, Tag, Ticket, type LucideIcon } from 'lucide-react';
import { CHECKOUT_BASE, paths, routes } from '@/app/routes';
import { es } from '@/shared/i18n';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Rutas en las que el ítem se marca como actual. */
  activeOn: string[];
}

/** Menú principal ordenado por el momento del viajero (README, sección 4). */
export const NAV_ITEMS: NavItem[] = [
  // "Vuelos" acompaña al viajero durante toda la compra: buscar, resultados y /compra/*.
  { to: routes.home(), label: es.nav.flights, icon: Plane, activeOn: [paths.home, paths.results, CHECKOUT_BASE] },
  { to: routes.offers(), label: es.nav.offers, icon: Tag, activeOn: [paths.offers] },
  { to: routes.trips(), label: es.nav.trips, icon: Ticket, activeOn: [paths.trips] },
  { to: routes.flightStatus(), label: es.nav.status, icon: PlaneTakeoff, activeOn: [paths.flightStatus] },
];

/** `/` solo coincide exacto; las demás rutas incluyen sus subrutas (/mis-viajes/:id…). */
export function isNavItemActive(item: NavItem, pathname: string) {
  return item.activeOn.some((base) =>
    base === paths.home ? pathname === base : pathname === base || pathname.startsWith(`${base}/`),
  );
}
