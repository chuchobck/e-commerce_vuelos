import type { Money, PassengerCount, SelectedLeg } from '@/shared/api';
import { addMoney } from '@/shared/lib/money';

export type { SelectedLeg } from '@/shared/api';

/** Lo elegido en el paso 1. Sobrevive a ir a ingresar/registrarse y a refrescar la página. */
export interface CheckoutSelection {
  /** Identifica esta elección (se asigna al guardarla): otra elección es otra compra. */
  id?: string;
  /** Oferta de la API que contiene los dos tramos (la pide el hold). */
  offerId: string;
  outbound: SelectedLeg;
  inbound?: SelectedLeg;
  passengers: PassengerCount;
  /** Búsqueda original (query de /resultados) para volver a los resultados. */
  searchQuery: string;
  /** Hold creado en el paso 2. Se guarda para no apartar cupo dos veces al refrescar. */
  holdId?: string;
}

/**
 * sessionStorage: dura lo que la pestaña (incluidos refrescos y la ida a /ingresar) y no
 * se comparte entre pestañas, así dos compras en paralelo no se pisan.
 */
const KEY = 'quinde.checkout';

/** Respaldo si el navegador bloquea el almacenamiento: dura lo que la página. */
let memory: CheckoutSelection | null = null;

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function isLeg(value: unknown): value is SelectedLeg {
  const leg = value as SelectedLeg | undefined;
  return (
    !!leg &&
    typeof leg.itinerary?.id === 'string' &&
    Array.isArray(leg.itinerary.segments) &&
    typeof leg.fare?.brand === 'string' &&
    typeof leg.fare.total?.cents === 'number'
  );
}

function isSelection(value: unknown): value is CheckoutSelection {
  const sel = value as CheckoutSelection | null;
  return (
    !!sel &&
    typeof sel.offerId === 'string' &&
    isLeg(sel.outbound) &&
    (sel.inbound === undefined || isLeg(sel.inbound)) &&
    typeof sel.passengers?.adults === 'number' &&
    typeof sel.searchQuery === 'string'
  );
}

export function saveSelection(input: CheckoutSelection): void {
  const selection = input.id ? input : { ...input, id: crypto.randomUUID() };
  memory = selection;
  try {
    storage()?.setItem(KEY, JSON.stringify(selection));
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
}

export function loadSelection(): CheckoutSelection | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isSelection(parsed)) return parsed;
    }
  } catch {
    /* datos corruptos o sin almacenamiento */
  }
  return memory;
}

/** Guarda (o quita) el hold de la selección actual. */
export function setSelectionHold(holdId: string | undefined): void {
  const current = loadSelection();
  if (current) saveSelection({ ...current, holdId });
}

export function clearSelection(): void {
  memory = null;
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* sin almacenamiento */
  }
}

/** Total de la selección para todos los pasajeros (suma en centavos). */
export function selectionTotal(selection: CheckoutSelection): Money {
  const out = selection.outbound.fare.total;
  return selection.inbound ? addMoney(out, selection.inbound.fare.total) : out;
}
