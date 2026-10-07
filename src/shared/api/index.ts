import type { FlightsApi } from './FlightsApi';
import { apiConfig } from './config';
import { MockFlightsApi } from './mock/MockFlightsApi';

/**
 * Punto único de acceso a los datos.
 *
 * Mientras no exista la API real se usa siempre el mock. Cuando la API esté documentada:
 *   1. Crear `HttpFlightsApi implements FlightsApi` en src/shared/api/http/ usando `apiConfig.apiUrl`.
 *   2. Devolverla aquí cuando `apiConfig.apiUrl` tenga valor.
 * No se inventan endpoints: la UI solo conoce la interfaz FlightsApi.
 */
function createFlightsApi(): FlightsApi {
  if (apiConfig.apiUrl && import.meta.env.DEV) {
    console.info(`[Quinde] VITE_API_URL=${apiConfig.apiUrl} definida, pero la implementación HTTP aún no existe. Se usa el mock.`);
  }
  return new MockFlightsApi();
}

export const flightsApi: FlightsApi = createFlightsApi();

export type { FlightsApi } from './FlightsApi';
export * from './types';
export { apiConfig } from './config';
export { AIRPORTS, cityOf, destinationsFrom, findAirport, hasFlights, type Airport, type RegionId } from './airports';
export { ApiError, errorMessage, fieldErrorMessage, isApiError, NotYetConnectedError, type FieldError } from './errors';
export { faresForCabin, itinerarySignature } from './mapping';
export {
  MOCK_OPERATIONS,
  SIMULATED_STATUSES,
  getForcedError,
  setForcedError,
  type SimulatedStatus,
} from './mock/network';
