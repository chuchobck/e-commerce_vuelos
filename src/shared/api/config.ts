const apiUrl = (import.meta.env.VITE_API_URL ?? '').trim();

/** Configuración de la capa de datos leída de variables de entorno de Vite. */
export const apiConfig = {
  /** URL base de la API real. Vacía = usar el mock. */
  apiUrl,
  /** Sin URL de la API se usa el mock (y se muestran las pistas "Para probar"). */
  usingMock: apiUrl === '',
  /** Probabilidad de error aleatorio en el mock (0 a 1). */
  mockErrorRate: clamp(Number(import.meta.env.VITE_MOCK_ERROR_RATE ?? '0.08'), 0, 1),
};

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return 0.08;
  return Math.min(max, Math.max(min, value));
}
