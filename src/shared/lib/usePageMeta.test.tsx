// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { es } from '@/shared/i18n';
import { usePageMeta } from './usePageMeta';

afterEach(() => {
  cleanup();
  document.head.querySelectorAll('meta').forEach((m) => m.remove());
});

const meta = (selector: string) => document.head.querySelector(selector)?.getAttribute('content');

describe('usePageMeta', () => {
  it('pone el título «Página · Quinde», la descripción y el Open Graph básico', () => {
    renderHook(() => usePageMeta('Ofertas', 'Las tarifas más bajas.'));
    expect(document.title).toBe('Ofertas · Quinde');
    expect(meta('meta[name="description"]')).toBe('Las tarifas más bajas.');
    expect(meta('meta[property="og:title"]')).toBe('Ofertas · Quinde');
    expect(meta('meta[property="og:description"]')).toBe('Las tarifas más bajas.');
  });

  it('actualiza las etiquetas que ya existen en index.html en vez de duplicarlas', () => {
    document.head.innerHTML = '<meta name="description" content="vieja"><meta property="og:title" content="vieja">';
    renderHook(() => usePageMeta('Ayuda', 'Respuestas.'));
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[property="og:title"]')).toHaveLength(1);
    expect(meta('meta[name="description"]')).toBe('Respuestas.');
  });

  it('sin descripción vuelve a la general del sitio: nunca queda la de la página anterior', () => {
    const { rerender } = renderHook(({ title, description }) => usePageMeta(title, description), { initialProps: { title: 'Ayuda', description: 'Respuestas.' as string | undefined } });
    rerender({ title: 'Mis viajes', description: undefined });
    expect(document.title).toBe('Mis viajes · Quinde');
    expect(meta('meta[name="description"]')).toBe(es.app.description);
  });

  it('cada página pública tiene su propia descripción, distinta de la general y de las demás', () => {
    const texts = [es.home.metaDescription, es.offers.metaDescription, es.help.metaDescription, es.results.metaDescription, es.status.metaDescription, es.auth.loginMeta, es.auth.registerMeta];
    expect(new Set([...texts, es.app.description]).size).toBe(texts.length + 1);
    // Una descripción útil para buscadores cabe en unos 160 caracteres.
    for (const text of [...texts, es.app.description]) expect(text.length).toBeLessThanOrEqual(170);
  });
});
