import { useEffect } from 'react';
import { es } from '@/shared/i18n';

/** Título de pestaña único y descriptivo por página (WCAG 2.4.2): "Mis reservas · Quinde". */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${es.app.titleSuffix}`;
  }, [title]);
}
