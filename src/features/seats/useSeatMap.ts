import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SeatMap } from '@/shared/api';
import { buildSeatLayout, type SeatLayout } from './model/layout';
import { fetchSeatMap, latestSeatMap, peekSeatMap, subscribeSeatMaps } from './seatMapStore';

/** Al volver a la pestaña no se vuelve a pedir si el mapa tiene menos de esto (evita ráfagas). */
const MIN_REFRESH_GAP_MS = 3_000;

export interface UseSeatMapResult {
  status: 'loading' | 'success' | 'error';
  map: SeatMap | undefined;
  layout: SeatLayout | undefined;
  error: unknown;
  /** Hay una actualización en curso (el mapa anterior sigue a la vista). */
  refreshing: boolean;
  /** Vuelve a pedir el mapa sin usar la memoria. Devuelve el mapa nuevo o `undefined` si falló. */
  refresh: () => Promise<SeatMap | undefined>;
}

/**
 * Mapa de asientos de un tramo (GET /offers/{offerId}/seatmap?segmentId=…, público y sin precios).
 * Se refresca solo al volver a la pestaña del navegador. Mientras se actualiza se conserva el mapa
 * anterior; si la actualización falla, también (el error solo se muestra cuando no hay mapa).
 */
export function useSeatMap(offerId: string, segmentId: string): UseSeatMapResult {
  const [state, setState] = useState<{ map?: SeatMap; error?: unknown; refreshing: boolean; key: string }>(() => ({
    map: peekSeatMap(offerId, segmentId)?.map,
    refreshing: false,
    key: `${offerId}|${segmentId}`,
  }));
  const key = `${offerId}|${segmentId}`;
  const callId = useRef(0);
  const loadedAt = useRef(0);

  const load = useCallback(
    async (fresh: boolean): Promise<SeatMap | undefined> => {
      const id = ++callId.current;
      setState((prev) => ({ ...prev, refreshing: true, error: undefined }));
      try {
        const map = await fetchSeatMap(offerId, segmentId, { fresh });
        loadedAt.current = Date.now();
        if (id === callId.current) setState({ map, refreshing: false, key });
        return map;
      } catch (error) {
        if (id === callId.current) setState((prev) => ({ ...prev, error, refreshing: false }));
        return undefined;
      }
    },
    [offerId, segmentId, key],
  );

  // Cambió el tramo: empieza de cero (con lo que haya en memoria) y lo pide.
  useEffect(() => {
    setState({ map: peekSeatMap(offerId, segmentId)?.map, refreshing: false, key });
    void load(false);
    const calls = callId;
    return () => {
      calls.current++;
    };
  }, [offerId, segmentId, key, load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAt.current > MIN_REFRESH_GAP_MS) void load(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // Otro componente (p. ej. la revisión tras un 409) pidió un mapa más nuevo: se adopta.
  useEffect(
    () =>
      subscribeSeatMaps(() => {
        const latest = latestSeatMap(offerId, segmentId);
        if (!latest) return;
        loadedAt.current = latest.loadedAt;
        setState((prev) => (prev.map === latest.map ? prev : { map: latest.map, refreshing: false, key }));
      }),
    [offerId, segmentId, key],
  );

  const refresh = useCallback(() => load(true), [load]);
  // Un estado de otro tramo no se mezcla con el actual mientras llega el nuevo.
  const map = state.key === key ? state.map : undefined;
  const layout = useMemo(() => (map ? buildSeatLayout(map) : undefined), [map]);
  const status = map ? 'success' : state.error && state.key === key ? 'error' : 'loading';
  return { status, map, layout, error: state.error, refreshing: state.refreshing, refresh };
}
