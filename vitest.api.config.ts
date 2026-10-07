import { defineConfig } from 'vitest/config';

/** `npm run test:api`: integración contra la API real. No forma parte de `npm run test`. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/api/**/*.test.ts'],
    testTimeout: 60_000,
    // Una petición a la vez: cuida el límite de la API (20 búsquedas por minuto).
    fileParallelism: false,
  },
});
