import type { BaggageOption, Money } from '@/shared/api';
import { multiplyMoney, sumMoney } from '@/shared/lib/money';

/** Lo elegido: maletas extra por pasajero e itinerario (`passengerId|itineraryId` → cantidad). */
export type BaggageSelection = Record<string, number>;

export const lineKey = (passengerId: string, itineraryId: string) => `${passengerId}|${itineraryId}`;

/** Cuántas maletas más se pueden agregar a esa opción (el máximo de la API menos lo ya comprado). */
export function remainingFor(option: BaggageOption): number {
  return Math.max(0, option.maxAllowed - option.alreadyPurchased);
}

export interface BaggageLine {
  option: BaggageOption;
  quantity: number;
  /** Precio de la línea (cantidad × precio de una maleta). */
  subtotal: Money;
}

/** Las líneas con al menos una maleta elegida, en el orden de las opciones. Una cantidad que pase el máximo se recorta. */
export function selectedLines(options: readonly BaggageOption[], selection: BaggageSelection): BaggageLine[] {
  return options.flatMap((option) => {
    const quantity = Math.min(selection[lineKey(option.passengerId, option.itineraryId)] ?? 0, remainingFor(option));
    if (quantity <= 0 || !option.price) return [];
    return [{ option, quantity, subtotal: multiplyMoney(option.price, quantity) }];
  });
}

/** Total a pagar en centavos enteros (nunca flotantes). */
export function baggageTotal(options: readonly BaggageOption[], selection: BaggageSelection): Money {
  const lines = selectedLines(options, selection);
  return sumMoney(lines.map((l) => l.subtotal), options.find((o) => o.price)?.price?.currency);
}

export function totalBags(options: readonly BaggageOption[], selection: BaggageSelection): number {
  return selectedLines(options, selection).reduce((n, l) => n + l.quantity, 0);
}
