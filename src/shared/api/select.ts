import type { FlightsApi } from './FlightsApi';
import { currentAccessToken } from './authBridge';
import { GraphqlFlightsApi } from './GraphqlFlightsApi';
import { createHttpClient } from './http/client';
import { createGraphqlClient } from './http/graphqlClient';
import { MockFlightsApi } from './mock/MockFlightsApi';
import { RealFlightsApi } from './RealFlightsApi';

/**
 * - `mock`: todo simulado.
 * - `real`: todo por REST al core (el modo de respaldo).
 * - `graphql`: búsqueda, mapa de asientos y estado de vuelo por GraphQL al BFF; cuenta, compra y postventa por REST.
 */
export type ApiMode = 'mock' | 'real' | 'graphql';

/**
 * VITE_API_URL vacía = mock completo (VITE_GRAPHQL_URL se ignora); solo VITE_API_URL = API real por REST;
 * las dos = lecturas públicas por GraphQL. Nunca se mezclan el mock y lo real.
 */
export function apiModeFor(apiUrl: string, graphqlUrl = ''): ApiMode {
  if (apiUrl.trim() === '') return 'mock';
  return graphqlUrl.trim() === '' ? 'real' : 'graphql';
}

export function createFlightsApi(apiUrl: string, { dev = false, graphqlUrl = '' } = {}): FlightsApi {
  const mode = apiModeFor(apiUrl, graphqlUrl);
  if (mode === 'mock') return new MockFlightsApi(currentAccessToken);
  // El detalle técnico de los errores solo va a la consola de desarrollo, nunca a la pantalla.
  const log = dev ? (message: string, detail?: unknown) => console.warn(message, detail) : undefined;
  const http = createHttpClient({ baseUrl: apiUrl.trim(), getAccessToken: currentAccessToken, log });
  if (mode === 'real') return new RealFlightsApi(http);
  return new GraphqlFlightsApi(http, createGraphqlClient({ url: graphqlUrl.trim(), log }));
}
