import { CalendarCheck, PlaneTakeoff, Search, type LucideIcon } from 'lucide-react';
import { es } from '@/shared/i18n';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Solo coincide con la ruta exacta (para "/"). */
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: es.nav.search, icon: Search, end: true },
  { to: '/check-in', label: es.nav.checkIn, icon: CalendarCheck },
  { to: '/estado-vuelo', label: es.nav.status, icon: PlaneTakeoff },
];
