import { flightsApi, type SeatMap } from '@/shared/api';

/**
 * Mapas de asientos ya pedidos, por oferta y tramo. Sirve para no repetir la petición al cambiar de
 * pestaña (la API limita las consultas de mapa a 60 por minuto) y para que varios componentes vean el
 * mismo mapa. Un mapa dura poco: los asientos se ocupan, así que `fetchSeatMap` con `fresh` siempre
 * vuelve a pedirlo.
 */
const MAX_AGE_MS = 20_000;

interface Entry {
  map: SeatMap;
  loadedAt: number;
}

const entries = new Map<string, Entry>();
const pending = new Map<string, Promise<SeatMap>>();
const listeners = new Set<() => void>();

const keyOf = (offerId: string, segmentId: string) => `${offerId}|${segmentId}`;

export function peekSeatMap(offerId: string, segmentId: string, now = Date.now()): Entry | undefined {
  const entry = entries.get(keyOf(offerId, segmentId));
  return entry && now - entry.loadedAt <= MAX_AGE_MS ? entry : undefined;
}

/** Pide el mapa (GET /offers/{offerId}/seatmap). Llamadas simultáneas comparten una sola petición. */
export function fetchSeatMap(offerId: string, segmentId: string, { fresh = false } = {}): Promise<SeatMap> {
  const key = keyOf(offerId, segmentId);
  if (!fresh) {
    const cached = peekSeatMap(offerId, segmentId);
    if (cached) return Promise.resolve(cached.map);
  }
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const request = flightsApi
    .getSeatMap(offerId, segmentId)
    .then((map) => {
      entries.set(key, { map, loadedAt: Date.now() });
      listeners.forEach((notify) => notify());
      return map;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

/** El último mapa pedido, sin importar su antigüedad (para revisar lo elegido contra lo más reciente). */
export function latestSeatMap(offerId: string, segmentId: string): Entry | undefined {
  return entries.get(keyOf(offerId, segmentId));
}

export function subscribeSeatMaps(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Vacía la memoria (pruebas). */
export function clearSeatMapStore(): void {
  entries.clear();
  pending.clear();
}
