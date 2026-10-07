/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_MOCK_ERROR_RATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
