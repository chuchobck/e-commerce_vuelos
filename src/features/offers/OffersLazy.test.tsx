// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchParams } from '@/shared/api';
import { es } from '@/shared/i18n';
import { Offers } from './OffersLazy';
import { offersCache } from './offersCache';
import { OFFERS, POPULAR_ROUTES } from './popularRoutes';
import { fare, flightOffer, searchResult } from './testSupport';

const api = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/api')>()), flightsApi: api }));

let intersect: (entries: Partial<IntersectionObserverEntry>[]) => void = () => undefined;

beforeEach(() => {
  sessionStorage.clear();
  offersCache.clear();
  api.search.mockReset().mockImplementation(async (params: SearchParams) =>
    searchResult(params, [flightOffer({ origin: params.origin, destination: params.destination }, params.departDate, { flight: 'LA1', departs: '06:00', fares: [fare(5000)] })]),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: typeof intersect) {
        intersect = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderOffers = (eager = false) =>
  render(
    <MemoryRouter>
      <Offers eager={eager} hrefFor={(o) => `/resultados?id=${o.id}`} searchHref="/" />
    </MemoryRouter>,
  );

describe('ofertas con carga diferida', () => {
  it('mientras la sección no se ve: reserva el espacio con su título y no pide NADA a la API', async () => {
    renderOffers();
    expect(screen.getByRole('heading', { name: es.offers.title })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 50));
    expect(api.search).not.toHaveBeenCalled();
    expect(screen.queryByRole('list', { name: es.offers.listLabel })).toBeNull();
  });

  it('al entrar en pantalla carga las ofertas con un máximo de 8 búsquedas y las muestra', async () => {
    renderOffers();
    act(() => intersect([{ isIntersecting: true }]));
    expect(await screen.findByRole('list', { name: es.offers.listLabel })).toBeTruthy();
    expect(api.search.mock.calls.length).toBeLessThanOrEqual(OFFERS.budget);
    expect(api.search).toHaveBeenCalledTimes(POPULAR_ROUTES.length);
    expect(screen.getAllByRole('link', { name: /^Ver vuelo/ })).toHaveLength(POPULAR_ROUTES.length);
  });

  it('eager (la página /ofertas): carga sin esperar a verse', async () => {
    renderOffers(true);
    expect(await screen.findByRole('list', { name: es.offers.listLabel })).toBeTruthy();
    expect(api.search).toHaveBeenCalled();
  });
});
