import { useCallback, useEffect, useRef, useState } from 'react';
import { flightsApi, type BookingSummary } from '@/shared/api';
import type { Authorized } from '@/shared/lib/authorized';


/** Reservas por página (la API admite hasta 50; con 10 la primera pantalla carga rápido). */
export const TRIPS_PAGE_SIZE = 10;

export interface TripsState {
  status: 'loading' | 'ready' | 'error';
  items: BookingSummary[];
  /** Hay otra página sin cargar. */
  hasMore: boolean;
  /** Se está pidiendo la siguiente página (las que ya se ven siguen visibles). */
  loadingMore: boolean;
  /** Error de la carga inicial, o de "Cargar más" si ya hay reservas a la vista. */
  error: unknown;
  loadMore: () => void;
  reload: () => void;
}

/**
 * Lista de reservas paginada por cursor. La primera carga trae `TRIPS_PAGE_SIZE`; «Cargar más» pide la siguiente con
 * el cursor que dio la API y las agrega (sin repetir) a las ya cargadas. Un fallo al cargar más no borra lo que ya se ve.
 */
export function useTrips(authorized: Authorized): TripsState {
  const [items, setItems] = useState<BookingSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<TripsState['status']>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const call = useRef(0);
  const authorizedRef = useRef(authorized);
  authorizedRef.current = authorized;

  const first = useCallback(async () => {
    const id = ++call.current;
    setStatus('loading');
    setError(undefined);
    try {
      const page = await authorizedRef.current(() => flightsApi.listBookings({ limit: TRIPS_PAGE_SIZE }));
      if (id !== call.current) return;
      setItems(page.items);
      setCursor(page.nextCursor);
      setStatus('ready');
    } catch (e) {
      if (id !== call.current) return;
      setError(e);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void first();
    const calls = call;
    return () => {
      calls.current++;
    };
  }, [first]);

  const loadMore = useCallback(() => {
    if (!cursor || loadingMore) return;
    const id = ++call.current;
    setLoadingMore(true);
    setError(undefined);
    authorizedRef
      .current(() => flightsApi.listBookings({ limit: TRIPS_PAGE_SIZE, cursor }))
      .then((page) => {
        if (id !== call.current) return;
        setItems((prev) => [...prev, ...page.items.filter((p) => !prev.some((x) => x.id === p.id))]);
        setCursor(page.nextCursor);
      })
      .catch((e: unknown) => {
        if (id === call.current) setError(e);
      })
      .finally(() => {
        if (id === call.current) setLoadingMore(false);
      });
  }, [cursor, loadingMore]);

  return { status, items, hasMore: cursor !== null, loadingMore, error, loadMore, reload: () => void first() };
}
