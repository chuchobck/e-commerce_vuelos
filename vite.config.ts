import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Librerías de uso general en chunks separados: cambian poco y el navegador las reutiliza en caché. Las que solo usan
        // algunas pantallas (react-day-picker, Radix de diálogos y casillas, la librería del QR) quedan en el archivo
        // de la pantalla que las pide, para que la primera carga no las descargue.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          forms: ['react-hook-form', '@hookform/resolvers', 'zod'],
          dates: ['date-fns'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
