import path from 'node:path';
import { defineConfig } from 'vitest/config';

/** `npm run test:api`: integración contra la API real. No forma parte de `npm run test`. */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['tests/api/**/*.test.ts'],
    testTimeout: 60_000,
    // Una petición a la vez: cuida los límites de la API (búsqueda 20/min, ingreso 5/min).
    fileParallelism: false,
  },
});
