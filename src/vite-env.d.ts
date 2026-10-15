/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Endpoint GraphQL del BFF (p. ej. http://localhost:4000/graphql). Solo cuenta si VITE_API_URL también tiene valor. */
  readonly VITE_GRAPHQL_URL?: string;
  readonly VITE_MOCK_ERROR_RATE?: string;
  /** Último día con salidas en la semilla del backend (yyyy-MM-dd). */
  readonly VITE_LAST_FLIGHT_DATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
