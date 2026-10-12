// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type SearchOptions, type SearchParams, type SearchResult } from '@/shared/api';
import { createTtlCache } from '@/shared/lib/ttlCache';
import type { Offer } from './cheapestOffer';
import type { LoadOffersDeps } from './loadOffers';
import { OFFERS, POPULAR_ROUTES } from './popularRoutes';
import { fare, flightOffer, searchResult } from './testSupport';
import { useOffers } from './useOffers';

afterEach(cleanup);

/** jsdom conserva sessionStorage entre pruebas del archivo: sin esto, la caché de una prueba llegaría a la siguiente. */
function setup(search?: (params: SearchParams, options: SearchOptions) => Promise<SearchResult>) {
  sessionStorage.clear();
  const fn = vi.fn(
    search ??
      (async (params: SearchParams) =>
        searchResult(params, [flightOffer({ origin: params.origin, destination: params.destination }, params.departDate, { flight: 'LA1', departs: '06:00', fares: [fare(5000)] })])),
  );
  const deps: LoadOffersDeps = { search: fn, cache: createTtlCache<Offer | null>('test.useOffers', OFFERS.ttlMs), today: () => new Date(2026, 9, 10), lastDate: () => new Date(2027, 0, 7) };
  return { deps, fn };
}

describe('useOffers', () => {
  it('no pide nada mientras la sección no esté en pantalla', async () => {
    const { deps, fn } = setup();
    const { result } = renderHook(() => useOffers(false, deps));
    await new Promise((r) => setTimeout(r, 30));
    expect(fn).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('loading');
  });

  it('al entrar en pantalla carga y deja el informe', async () => {
    const { deps } = setup();
    const { result, rerender } = renderHook(({ on }) => useOffers(on, deps), { initialProps: { on: false } });
    rerender({ on: true });
    await waitFor(() => expect(result.current.state.status).toBe('done'));
    const state = result.current.state;
    if (state.status !== 'done') throw new Error('esperaba el informe');
    expect(state.report.offers).toHaveLength(POPULAR_ROUTES.length);
    expect(state.report.searches).toBe(POPULAR_ROUTES.length);
  });

  it('StrictMode (doble montaje) no duplica las búsquedas', async () => {
    const { deps, fn } = setup();
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
    const { result } = renderHook(() => useOffers(true, deps), { wrapper });
    await waitFor(() => expect(result.current.state.status).toBe('done'));
    expect(fn).toHaveBeenCalledTimes(POPULAR_ROUTES.length);
  });

  it('al desmontar cancela lo que está en vuelo, no manda más y no actualiza el estado', async () => {
    const signals: AbortSignal[] = [];
    const { deps, fn } = setup(
      (_params, options) =>
        new Promise<SearchResult>((_resolve, reject) => {
          if (options.signal) {
            signals.push(options.signal);
            options.signal.addEventListener('abort', () => reject(new ApiError({ status: 0, code: 'ABORTED' })));
          }
        }),
    );
    const { unmount } = renderHook(() => useOffers(true, deps));
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2));
    unmount();
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.aborted)).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('desmontar antes del primer tick no envía ninguna búsqueda', async () => {
    const { deps, fn } = setup();
    const { unmount } = renderHook(() => useOffers(true, deps));
    unmount();
    await new Promise((r) => setTimeout(r, 30));
    expect(fn).not.toHaveBeenCalled();
  });

  it('reintentar vuelve a cargar y solo pide lo que no está en caché', async () => {
    let fail = true;
    const { deps, fn } = setup(async (params) => {
      if (fail && params.origin === 'GYE' && params.destination === 'GPS') throw new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE' });
      return searchResult(params, [flightOffer({ origin: params.origin, destination: params.destination }, params.departDate, { flight: 'LA1', departs: '06:00', fares: [fare(5000)] })]);
    });
    const { result } = renderHook(() => useOffers(true, deps));
    await waitFor(() => expect(result.current.state.status).toBe('done'));
    expect(fn).toHaveBeenCalledTimes(POPULAR_ROUTES.length);
    fail = false;
    act(() => result.current.reload());
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('done'));
    expect(fn).toHaveBeenCalledTimes(POPULAR_ROUTES.length + 1);
    const state = result.current.state;
    if (state.status !== 'done') throw new Error('esperaba el informe');
    expect(state.report.failed).toEqual([]);
    expect(state.report.offers).toHaveLength(POPULAR_ROUTES.length);
  });
});
