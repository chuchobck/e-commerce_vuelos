import type { SearchParams } from '../types';
import type { SimulatedStatus } from './network';

/**
 * Casos de la búsqueda del mock que se piden con la URL (`/?escenario=limite-429`) para ver los estados de las ofertas del
 * inicio sin tocar el servidor ni esperar a que algo falle solo. Solo existen con el mock (VITE_API_URL vacía); la API real
 * no sabe nada de esto. Cada carga de la página empieza de cero (el estado vive en memoria).
 */
export const MOCK_SCENARIOS = ['sin-vuelos', 'ruta-sin-vuelos', 'limite-429', 'error-503', 'servidor-caido', 'lento'] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export const SCENARIO_PARAM = 'escenario';

/** `lento`: la primera búsqueda tarda esto de más (el arranque en frío de Render tarda ~50 s; aquí basta para pasar los 8 s del aviso). */
export const SLOW_FIRST_SEARCH_MS = 12_000;
/** `limite-429`: la búsqueda número N de la carga responde 429 con Retry-After; después ya responde bien. */
export const RATE_LIMITED_CALL = 3;

/** El escenario de la URL actual, o null si no hay o no existe. */
export function activeScenario(search: string = globalThis.location?.search ?? ''): MockScenario | null {
  const value = new URLSearchParams(search).get(SCENARIO_PARAM);
  return MOCK_SCENARIOS.find((s) => s === value) ?? null;
}

export interface ScenarioPlan {
  /** Espera adicional antes de responder. */
  extraDelayMs: number;
  /** Error con el que responde, o null si responde bien. */
  failure: SimulatedStatus | null;
  /** Responde bien, pero sin ofertas (esa ruta o fecha no tiene vuelos). */
  noFlights: boolean;
}

let searchCalls = 0;

/** Vuelve a empezar la cuenta de búsquedas (una carga nueva de la página; también lo usan las pruebas). */
export function resetScenarioState(): void {
  searchCalls = 0;
}

const NORMAL: ScenarioPlan = { extraDelayMs: 0, failure: null, noFlights: false };

/** Qué le pasa a esta búsqueda en el escenario activo. Cuenta como una búsqueda más de la carga. */
export function planFor(scenario: MockScenario | null, { origin, destination }: Pick<SearchParams, 'origin' | 'destination'>): ScenarioPlan {
  searchCalls += 1;
  switch (scenario) {
    case 'sin-vuelos':
      return { ...NORMAL, noFlights: true };
    case 'ruta-sin-vuelos':
      return { ...NORMAL, noFlights: origin === 'UIO' && destination === 'CUE' };
    case 'limite-429':
      return { ...NORMAL, failure: searchCalls === RATE_LIMITED_CALL ? 429 : null };
    case 'error-503':
      return { ...NORMAL, failure: origin === 'GYE' && destination === 'GPS' ? 503 : null };
    case 'servidor-caido':
      return { ...NORMAL, failure: 503 };
    case 'lento':
      return { ...NORMAL, extraDelayMs: searchCalls === 1 ? SLOW_FIRST_SEARCH_MS : 0 };
    default:
      return NORMAL;
  }
}
