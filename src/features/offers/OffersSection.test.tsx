// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { es, fmt } from '@/shared/i18n';
import type { Offer } from './cheapestOffer';
import type { LoadOffersReport } from './loadOffers';
import { OffersSection } from './OffersSection';
import { offer } from './testSupport';
import type { OffersState } from './useOffers';

const hook = vi.hoisted(() => ({ state: { status: 'loading' } as OffersState, reload: vi.fn() }));
vi.mock('./useOffers', () => ({ useOffers: () => ({ state: hook.state, reload: hook.reload }) }));

const t = es.offers;

function report(over: Partial<LoadOffersReport> = {}): OffersState {
  return { status: 'done', report: { offers: [], searches: 0, noFlights: [], failed: [], skipped: [], rateLimited: null, aborted: false, ...over } };
}

const ALL: Offer[] = [
  offer({ origin: 'GYE', destination: 'CUE', price: { cents: 4000, currency: 'USD' } }),
  offer({ origin: 'UIO', destination: 'GYE', price: { cents: 5500, currency: 'USD' } }),
  offer({ origin: 'UIO', destination: 'CUE', price: { cents: 6000, currency: 'USD' } }),
  offer({ origin: 'LOH', destination: 'CUE', price: { cents: 9000, currency: 'USD' } }),
  offer({ origin: 'GYE', destination: 'GPS', price: { cents: 19000, currency: 'USD' } }),
  offer({ origin: 'UIO', destination: 'GPS', price: { cents: 21000, currency: 'USD' } }),
];

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function renderSection(props: { heading?: boolean } = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<OffersSection hrefFor={(o) => `/resultados?id=${o.id}`} searchHref="/?x=1#buscador" {...props} />} />
        <Route path="/resultados" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const cards = () => within(screen.getByRole('list', { name: t.listLabel })).getAllByRole('listitem');
const announcement = () => document.querySelector('p.sr-only')?.textContent;

beforeEach(() => {
  hook.state = { status: 'loading' };
  hook.reload.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('sección de ofertas: carga', () => {
  it('mientras carga: texto de estado y marcadores, sin tarjetas ni mensajes de error', () => {
    renderSection();
    expect(screen.getByRole('heading', { level: 2, name: t.title })).toBeTruthy();
    expect(screen.getByText(t.loading)).toBeTruthy();
    expect(screen.queryByRole('list', { name: t.listLabel })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(t.waking)).toBeNull();
  });

  it('pasados 8 s cargando avisa que el servidor se está despertando (no antes)', () => {
    vi.useFakeTimers();
    renderSection();
    act(() => void vi.advanceTimersByTime(7999));
    expect(screen.queryByText(t.waking)).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByText(t.waking)).toBeTruthy();
  });

  it('sin título propio (página /ofertas) no agrega otro encabezado', () => {
    hook.state = report({ offers: ALL });
    renderSection({ heading: false });
    expect(screen.queryByRole('heading', { level: 2, name: t.title })).toBeNull();
    expect(screen.getByRole('region', { name: t.listLabel })).toBeTruthy();
  });
});

describe('sección de ofertas: tarjetas, orden y filtros', () => {
  it('muestra las ofertas de menor a mayor precio y anuncia cuántas se cargaron', () => {
    hook.state = report({ offers: [...ALL].reverse() });
    renderSection();
    const prices = cards().map((li) => within(li).getByText(/^Desde /).textContent);
    expect(prices).toEqual(['Desde $40,00', 'Desde $55,00', 'Desde $60,00', 'Desde $90,00', 'Desde $190,00', 'Desde $210,00']);
    expect(announcement()).toBe(fmt(t.loaded, { count: 6 }));
  });

  it('muestra como máximo 6 tarjetas', () => {
    hook.state = report({ offers: [...ALL, offer({ origin: 'CUE', destination: 'UIO', price: { cents: 30000, currency: 'USD' } }), offer({ origin: 'CUE', destination: 'GYE', price: { cents: 31000, currency: 'USD' } })] });
    renderSection();
    expect(cards()).toHaveLength(6);
    expect(screen.queryByText('Desde $310,00')).toBeNull();
  });

  it('una sola oferta se anuncia en singular', () => {
    hook.state = report({ offers: [ALL[0]] });
    renderSection();
    expect(announcement()).toBe(t.loadedOne);
  });

  it('los chips son solo los orígenes con ofertas, en orden fijo, y «Todas» empieza activo', () => {
    hook.state = report({ offers: ALL });
    renderSection();
    const group = screen.getByRole('group', { name: t.filtersLabel });
    const chips = within(group).getAllByRole('button');
    expect(chips.map((c) => c.textContent)).toEqual([t.filterAll, 'Quito', 'Guayaquil', 'Loja']);
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
  });

  it('filtrar por origen deja solo sus ofertas (aún por precio), lo anuncia y «Todas» las devuelve', () => {
    hook.state = report({ offers: ALL });
    renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Guayaquil' }));
    expect(screen.getByRole('button', { name: 'Guayaquil' }).getAttribute('aria-pressed')).toBe('true');
    expect(cards().map((li) => within(li).getByRole('heading', { level: 3 }).getAttribute('aria-label'))).toEqual(['De Guayaquil a Cuenca', 'De Guayaquil a Baltra']);
    expect(announcement()).toBe(fmt(t.filtered, { count: 2, city: 'Guayaquil' }));
    fireEvent.click(screen.getByRole('button', { name: 'Loja' }));
    expect(cards()).toHaveLength(1);
    expect(announcement()).toBe(fmt(t.filteredOne, { city: 'Loja' }));
    fireEvent.click(screen.getByRole('button', { name: t.filterAll }));
    expect(cards()).toHaveLength(6);
  });

  it('con un solo origen no hay filtros que elegir', () => {
    hook.state = report({ offers: [ALL[1], ALL[2]] });
    renderSection();
    expect(screen.queryByRole('group', { name: t.filtersLabel })).toBeNull();
  });

  it('«Ver vuelo» lleva a los resultados de esa oferta', () => {
    hook.state = report({ offers: ALL });
    renderSection();
    const link = within(cards()[1]).getByRole('link');
    expect(link.textContent).toBe(t.cta);
    fireEvent.click(link);
    expect(screen.getByTestId('where').textContent).toBe('/resultados?id=UIO-GYE-2026-10-13');
  });
});

describe('sección de ofertas: sin ofertas y errores (nunca rompe el inicio)', () => {
  it('sin ofertas: mensaje útil y un camino claro a buscar', () => {
    hook.state = report({ noFlights: [{ origin: 'UIO', destination: 'GYE' }] });
    renderSection();
    expect(screen.getByRole('heading', { name: t.emptyTitle })).toBeTruthy();
    expect(screen.getByRole('link', { name: es.common.searchFlights }).getAttribute('href')).toBe('/?x=1#buscador');
    expect(screen.queryByRole('list', { name: t.listLabel })).toBeNull();
  });

  it('todas fallaron: bloque discreto con «Reintentar» (no un error a pantalla completa) y camino a buscar', () => {
    hook.state = report({ failed: [{ origin: 'UIO', destination: 'GYE' }] });
    renderSection();
    expect(screen.getByText(t.errorTitle)).toBeTruthy();
    expect(screen.getByText(t.errorText)).toBeTruthy();
    expect(screen.getByRole('link', { name: es.common.searchFlights })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.retry }));
    expect(hook.reload).toHaveBeenCalledTimes(1);
  });

  it('falla parcial: se muestran las rutas que sí cargaron, con un aviso y «Reintentar»', () => {
    hook.state = report({ offers: ALL.slice(0, 3), failed: [{ origin: 'GYE', destination: 'GPS' }] });
    renderSection();
    expect(cards()).toHaveLength(3);
    expect(screen.getByText(t.partialText)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.retry }));
    expect(hook.reload).toHaveBeenCalledTimes(1);
  });

  it('sin vuelos en algunas rutas no es un error: no se muestra ningún aviso', () => {
    hook.state = report({ offers: ALL.slice(0, 3), noFlights: [{ origin: 'GYE', destination: 'GPS' }] });
    renderSection();
    expect(cards()).toHaveLength(3);
    expect(screen.queryByText(t.partialText)).toBeNull();
    expect(screen.queryByRole('button', { name: t.retry })).toBeNull();
  });

  it('429: explica la pausa y «Reintentar» espera el Retry-After antes de habilitarse', () => {
    vi.useFakeTimers();
    hook.state = report({ rateLimited: { retryAfterSeconds: 3 } });
    renderSection();
    expect(screen.getByText(t.rateLimitedTitle)).toBeTruthy();
    const retry = screen.getByRole('button', { name: t.retry }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    act(() => void vi.advanceTimersByTime(3000));
    expect((screen.getByRole('button', { name: t.retry }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('429 sin Retry-After: igual espera un poco por cortesía', () => {
    hook.state = report({ rateLimited: { retryAfterSeconds: null } });
    renderSection();
    expect((screen.getByRole('button', { name: t.retry }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('429 con ofertas ya cargadas: las muestra y deja el aviso con espera', () => {
    hook.state = report({ offers: ALL.slice(0, 2), rateLimited: { retryAfterSeconds: 20 } });
    renderSection();
    expect(cards()).toHaveLength(2);
    expect(screen.getByText(t.partialText)).toBeTruthy();
    expect((screen.getByRole('button', { name: t.retry }) as HTMLButtonElement).disabled).toBe(true);
  });
});
