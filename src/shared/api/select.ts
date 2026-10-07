import type { FlightsApi } from './FlightsApi';
import { currentAccessToken } from './authBridge';
import { createHttpClient } from './http/client';
import { MockFlightsApi } from './mock/MockFlightsApi';
import { RealFlightsApi } from './RealFlightsApi';

export type ApiMode = 'mock' | 'real';

/** VITE_API_URL vacía = mock completo; con valor = API real. Nunca se mezclan en un mismo modo. */
export function apiModeFor(apiUrl: string): ApiMode {
  return apiUrl.trim() === '' ? 'mock' : 'real';
}

export function createFlightsApi(apiUrl: string, { dev = false } = {}): FlightsApi {
  if (apiModeFor(apiUrl) === 'mock') return new MockFlightsApi(currentAccessToken);
  return new RealFlightsApi(
    createHttpClient({
      baseUrl: apiUrl.trim(),
      getAccessToken: currentAccessToken,
      // El detalle técnico de los errores solo va a la consola de desarrollo, nunca a la pantalla.
      log: dev ? (message, detail) => console.warn(message, detail) : undefined,
    }),
  );
}
