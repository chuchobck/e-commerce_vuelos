import { useEffect } from 'react';
import { es } from '@/shared/i18n';

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.append(element);
  }
  element.setAttribute('content', content);
}

/**
 * Título de pestaña único y descriptivo por página (WCAG 2.4.2): "Mis reservas · Quinde", más su descripción y los datos
 * básicos de Open Graph. Sin `description` vuelve la general del sitio: nunca queda la de la página anterior.
 * Los rastreadores que no ejecutan JavaScript leen lo de index.html (la del inicio).
 */
export function usePageMeta(title: string, description: string = es.app.description) {
  useEffect(() => {
    const full = `${title} · ${es.app.titleSuffix}`;
    document.title = full;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', full);
    setMeta('property', 'og:description', description);
  }, [title, description]);
}
