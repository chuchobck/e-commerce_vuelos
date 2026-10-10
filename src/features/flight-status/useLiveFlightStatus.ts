import { useCallback, useEffect, useRef, useState } from 'react';
import { flightsApi, type FlightStatus } from '@/shared/api';

/** Al volver a la pestaña no se vuelve a pedir si el dato tiene menos de esto (sin polling agresivo). */
const MIN_REFRESH_GAP_MS = 30_000;

export interface LiveFlightStatus {
  status: 'loading' | 'ready' | 'error';
  data: FlightStatus | undefined;
  error: unknown;
  /** Hay una consulta en curso (el dato anterior sigue a la vista). */
  refreshing: boolean;
  /** Cuándo se consultó por última vez (Date.now()). */
  updatedAt: number | undefined;
  refresh: () => void;
}

/**
 * Estado de un vuelo (GET /flights/{n}/status, público) para mostrarlo "en vivo" sin polling: se consulta al abrir,
 * con el botón de actualizar y al volver a enfocar la pestaña (si pasaron más de 30 s). Si una actualización falla, se
 * conserva el último dato bueno y se avisa; el error solo reemplaza al dato cuando nunca hubo uno.
 */
export function useLiveFlightStatus(flightNumber: string, date: string): LiveFlightStatus {
  const [data, setData] = useState<FlightStatus | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [refreshing, setRefreshing] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | undefined>(undefined);
  const call = useRef(0);
  const last = useRef(0);

  const load = useCallback(async () => {
    const id = ++call.current;
    setRefreshing(true);
    try {
      const next = await flightsApi.getFlightStatus(flightNumber, date);
      if (id !== call.current) return;
      last.current = Date.now();
      setData(next);
      setError(undefined);
      setUpdatedAt(last.current);
    } catch (e) {
      if (id === call.current) setError(e);
    } finally {
      if (id === call.current) setRefreshing(false);
    }
  }, [flightNumber, date]);

  useEffect(() => {
    setData(undefined);
    setError(undefined);
    void load();
    const calls = call;
    return () => {
      calls.current++;
    };
  }, [load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - last.current > MIN_REFRESH_GAP_MS) void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const status = data ? 'ready' : error ? 'error' : 'loading';
  return { status, data, error, refreshing, updatedAt, refresh: () => void load() };
}
