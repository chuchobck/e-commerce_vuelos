import type { FlightsApi } from './FlightsApi';
import { apiConfig } from './config';
import { RealFlightsApi } from './RealFlightsApi';
import { createFlightsApi } from './select';

/**
 * Punto único de acceso a los datos. VITE_API_URL vacía = mock; con valor = API real
 * (ver select.ts). La interfaz solo conoce FlightsApi.
 */
export const flightsApi: FlightsApi = createFlightsApi(apiConfig.apiUrl, { dev: import.meta.env.DEV });

/**
 * En modo real, al cargar la app se hace un GET /health silencioso para despertar el servidor
 * gratuito de Render mientras el usuario escribe su búsqueda. Si falla, no pasa nada.
 */
export function warmUpServer(): void {
  if (flightsApi instanceof RealFlightsApi) void flightsApi.warmUp().catch(() => undefined);
}

export type { FlightsApi } from './FlightsApi';
export * from './types';
export { apiConfig } from './config';
export { apiModeFor, type ApiMode } from './select';
export { AIRPORTS, cityOf, destinationsFrom, findAirport, hasFlights, type Airport, type RegionId } from './airports';
export { ApiError, errorMessage, fieldErrorMessage, isApiError, NotYetConnectedError, type FieldError } from './errors';
export { faresForCabin, itinerarySignature } from './mapping';
export { useServerWaking } from './http/useServerWaking';
export {
  MOCK_OPERATIONS,
  SIMULATED_STATUSES,
  getForcedError,
  setForcedError,
  type SimulatedStatus,
} from './mock/network';
