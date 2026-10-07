import type { BaggageAllowance, Cabin, FareFamily } from '../../types';

export interface FareRule {
  family: FareFamily;
  multiplier: number;
  baggage: BaggageAllowance;
  changeable: boolean;
  changeFee: number | null;
  refundable: boolean;
  seatSelectionIncluded: boolean;
}

/** Familias de tarifa con el equipaje incluido. */
export const FARE_RULES: FareRule[] = [
  {
    family: 'LIGHT',
    multiplier: 1,
    baggage: { personalItem: true, carryOnKg: 10, checkedBags: 0, checkedBagKg: 0 },
    changeable: true,
    changeFee: 45,
    refundable: false,
    seatSelectionIncluded: false,
  },
  {
    family: 'CLASSIC',
    multiplier: 1.28,
    baggage: { personalItem: true, carryOnKg: 10, checkedBags: 1, checkedBagKg: 23 },
    changeable: true,
    changeFee: 25,
    refundable: false,
    seatSelectionIncluded: true,
  },
  {
    family: 'FLEX',
    multiplier: 1.62,
    baggage: { personalItem: true, carryOnKg: 10, checkedBags: 2, checkedBagKg: 23 },
    changeable: true,
    changeFee: 0,
    refundable: true,
    seatSelectionIncluded: true,
  },
];

export const CABIN_MULTIPLIER: Record<Cabin, number> = {
  ECONOMY: 1,
  BUSINESS: 2.1,
};

/** Precio de un niño respecto del adulto y tarifa mínima del infante (con tasas). */
export const CHILD_RATIO = 0.75;
export const INFANT_RATIO = 0.1;
export const INFANT_MIN = 15;

/** Recargo por destino especial (tasas de Galápagos no incluidas: se pagan en el aeropuerto). */
export const GALAPAGOS_SURCHARGE = 95;

export const HOLD_MINUTES = 15;
