import { useCallback, useEffect, useRef, useState } from 'react';
import { flightsApi, isAbortError, type DeparturesPage } from '@/shared/api';

/** Cada cuánto se actualiza el tablero mientras la pestaña se ve. */
export const REFRESH_MS = 30_000;
/** Tope de páginas que una actualización vuelve a pedir (cada página es una petición). */
const MAX_PAGES = 10;

export interface DeparturesState {
  /** `loading`: primera carga; `ready`: hay tabla (aunque la última actualización haya fallado); `error`: nunca se pudo cargar. */
  status: 'loading' | 'ready' | 'error';
  page: DeparturesPage | null;
  /** Instante de la última carga correcta. */
  updatedAt: Date | null;
  /** La última actualización falló: la tabla que se ve es la anterior. */
  stale: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  moreFailed: boolean;
  loadMore: () => void;
  retry: () => void;
}

/**
 * Salidas de un aeropuerto y fecha, al día: se piden al abrir y se repiten cada 30 s. Con la pestaña oculta no se pide nada y, al
 * volver, si pasó el intervalo se actualiza de inmediato. Si una actualización falla se conserva la última tabla y se avisa.
 * «Ver más» suma la página siguiente (`nextCursor`); al actualizar se vuelven a pedir las páginas ya vistas.
 */
export function useDepartures(airport: string, date: string): DeparturesState {
  const [state, setState] = useState<Omit<DeparturesState, 'loadMore' | 'retry'>>({
    status: 'loading',
    page: null,
    updatedAt: null,
    stale: false,
    refreshing: false,
    loadingMore: false,
    moreFailed: false,
  });
  const pages = useRef(1);
  const controller = useRef<AbortController>();
  const lastLoad = useRef(0);
  const busy = useRef(false);

  const load = useCallback(
    async (count: number) => {
      if (busy.current) return;
      busy.current = true;
      const abort = new AbortController();
      controller.current = abort;
      setState((s) => ({ ...s, refreshing: true }));
      try {
        let page = await flightsApi.getDepartures(airport, date, { signal: abort.signal });
        let all = page.departures;
        for (let n = 1; n < Math.min(count, MAX_PAGES) && page.nextCursor; n += 1) {
          page = await flightsApi.getDepartures(airport, date, { cursor: page.nextCursor, signal: abort.signal });
          all = [...all, ...page.departures];
        }
        lastLoad.current = Date.now();
        setState((s) => ({ ...s, status: 'ready', page: { ...page, departures: all }, updatedAt: new Date(), stale: false, refreshing: false, moreFailed: false }));
      } catch (error) {
        if (isAbortError(error)) return;
        setState((s) => ({ ...s, status: s.page ? 'ready' : 'error', stale: s.page !== null, refreshing: false }));
      } finally {
        busy.current = false;
      }
    },
    [airport, date],
  );

  // Cambio de aeropuerto o de fecha: se cancela lo pendiente y se empieza de cero (sin mostrar la tabla del otro).
  useEffect(() => {
    pages.current = 1;
    busy.current = false;
    setState({ status: 'loading', page: null, updatedAt: null, stale: false, refreshing: false, loadingMore: false, moreFailed: false });
    void load(1);
    return () => controller.current?.abort();
  }, [load]);

  useEffect(() => {
    const refresh = () => {
      if (document.hidden) return;
      void load(pages.current);
    };
    const timer = setInterval(refresh, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden && Date.now() - lastLoad.current >= REFRESH_MS) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const loadMore = useCallback(() => {
    const cursor = state.page?.nextCursor;
    if (!cursor || busy.current) return;
    busy.current = true;
    const abort = new AbortController();
    controller.current = abort;
    setState((s) => ({ ...s, loadingMore: true, moreFailed: false }));
    flightsApi
      .getDepartures(airport, date, { cursor, signal: abort.signal })
      .then((next) => {
        pages.current += 1;
        setState((s) => (s.page ? { ...s, loadingMore: false, page: { ...next, departures: [...s.page.departures, ...next.departures] } } : s));
      })
      .catch((error) => {
        if (!isAbortError(error)) setState((s) => ({ ...s, loadingMore: false, moreFailed: true }));
      })
      .finally(() => {
        busy.current = false;
      });
  }, [airport, date, state.page?.nextCursor]);

  const retry = useCallback(() => void load(pages.current), [load]);

  return { ...state, loadMore, retry };
}
