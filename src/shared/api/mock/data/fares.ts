/** Familias tarifarias de la semilla del backend (sección 3), las mismas para las dos aerolíneas. */
export interface MockFamily {
  cabin: 'ECONOMY' | 'BUSINESS';
  brand: string;
  personalItem: boolean;
  carryOn: number;
  checked: number;
  refundable: boolean;
  changeable: boolean;
  /** Multiplicador sobre la tarifa BASIC. */
  factor: number;
}

export const FAMILIES: MockFamily[] = [
  { cabin: 'ECONOMY', brand: 'BASIC', personalItem: true, carryOn: 0, checked: 0, refundable: false, changeable: false, factor: 1 },
  { cabin: 'ECONOMY', brand: 'CLASSIC', personalItem: true, carryOn: 1, checked: 1, refundable: true, changeable: true, factor: 1.2 },
  { cabin: 'ECONOMY', brand: 'FLEX', personalItem: true, carryOn: 1, checked: 2, refundable: true, changeable: true, factor: 1.55 },
  { cabin: 'BUSINESS', brand: 'BUSINESS_FLEX', personalItem: true, carryOn: 2, checked: 2, refundable: true, changeable: true, factor: 2.6 },
];

/** Precio por tipo de pasajero respecto del adulto (los que responde la API). */
export const PASSENGER_FACTOR = { ADULT: 1, YOUTH: 0.9, CHILD: 0.75, INFANT: 0.1 } as const;

/**
 * Factor de demanda y recargo de viernes y domingos (+10 %) que reproducen los precios de la API,
 * medidos el 2026-10-07: ruta de 55 USD → 71,50 un martes y 78,65 un domingo. Impuestos: 20 %.
 */
export const DEMAND_FACTOR = 1.3;
export const WEEKEND_SURCHARGE = 1.1;
export const TAX_RATE = 0.2;

/** La semilla genera salidas para los próximos 90 días. */
export const SCHEDULE_DAYS = 90;

/** Escalas: misma aerolínea, conexión de 45 minutos a 6 horas (reglas de búsqueda del backend). */
export const MIN_CONNECTION_MIN = 45;
export const MAX_CONNECTION_MIN = 360;
/** Tope de ofertas por búsqueda (como la API). */
export const MAX_OFFERS = 20;

export const HOLD_MINUTES = 15;
