/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_MOCK_ERROR_RATE?: string;
  /** Último día con salidas en la semilla del backend (yyyy-MM-dd). */
  readonly VITE_LAST_FLIGHT_DATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
