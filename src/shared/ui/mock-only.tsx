import type { ReactNode } from 'react';
import { apiConfig } from '@/shared/api';

/**
 * Muestra su contenido solo con la API simulada (VITE_API_URL vacía): pistas como
 * "Para probar: vuelo QD100…" nunca deben verse en una compilación con la API real.
 */
export function MockOnly({ children }: { children: ReactNode }) {
  return apiConfig.usingMock ? <>{children}</> : null;
}
