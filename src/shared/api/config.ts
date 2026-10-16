import { identityUrlFor } from './urls';

const apiUrl = (import.meta.env.VITE_API_URL ?? '').trim();
// Sin API real no hay BFF: con la API vacía (mock completo) VITE_GRAPHQL_URL se ignora, nunca se mezclan.
const graphqlUrl = apiUrl === '' ? '' : (import.meta.env.VITE_GRAPHQL_URL ?? '').trim();
// La cuenta va a identity: VITE_IDENTITY_URL o, si está vacía, la derivada de la API (ver urls.ts). Vacía con el mock.
const identityUrl = identityUrlFor(apiUrl, import.meta.env.VITE_IDENTITY_URL ?? '');

/** Configuración de la capa de datos leída de variables de entorno de Vite. */
export const apiConfig = {
  /** URL base de la API real. Vacía = usar el mock. */
  apiUrl,
  /**
   * Endpoint GraphQL del BFF. Con valor (y con la API real), búsqueda, mapa de asientos y estado de vuelo van por GraphQL;
   * vacío = todo por REST. Siempre vacío en modo mock.
   */
  graphqlUrl,
  /** Base de identity (register, login, refresh, logout y me). Vacía = mock. */
  identityUrl,
  /** Sin URL de la API se usa el mock (y se muestran las pistas "Para probar"). */
  usingMock: apiUrl === '',
  /** Probabilidad de error aleatorio en el mock (0 a 1). */
  mockErrorRate: clamp(Number(import.meta.env.VITE_MOCK_ERROR_RATE ?? '0.08'), 0, 1),
};

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return 0.08;
  return Math.min(max, Math.max(min, value));
}
