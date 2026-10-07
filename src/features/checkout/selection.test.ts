import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fare, FlightOffer } from '@/shared/api';
import type { CheckoutSelection } from './selection';

/** sessionStorage mínima en memoria: sobrevive a "refrescar" (recargar el módulo). */
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const offer = { id: 'off_1', segments: [{ flightNumber: 'QD100' }], fares: [] } as unknown as FlightOffer;
const fare = { id: 'fare_classic', totalPrice: 120.1 } as unknown as Fare;
const back = { id: 'fare_light', totalPrice: 80.25 } as unknown as Fare;

const SELECTION: CheckoutSelection = {
  outbound: { offer, fare },
  inbound: { offer: { ...offer, id: 'off_2' }, fare: back },
  passengers: { adults: 1, children: 0, infants: 0 },
  searchQuery: 'origen=UIO&destino=GYE&ida=2026-10-12',
};

/** Simula un refresco de página: módulo nuevo (memoria vacía), mismo almacenamiento. */
async function freshModule() {
  vi.resetModules();
  return import('./selection');
}

describe('selección de compra', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', fakeStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sobrevive a ir a ingresar y a refrescar la página', async () => {
    (await freshModule()).saveSelection(SELECTION);
    const reloaded = await freshModule();
    expect(reloaded.loadSelection()).toEqual(SELECTION);
  });

  it('guarda el hold del paso 2 para no crear otro al refrescar', async () => {
    const mod = await freshModule();
    mod.saveSelection(SELECTION);
    mod.setSelectionHold('hold_1');
    expect((await freshModule()).loadSelection()?.holdId).toBe('hold_1');
  });

  it('se borra al cancelar la compra', async () => {
    const mod = await freshModule();
    mod.saveSelection(SELECTION);
    mod.clearSelection();
    expect((await freshModule()).loadSelection()).toBeNull();
  });

  it('ignora datos corruptos o incompletos', async () => {
    sessionStorage.setItem('quinde.checkout', '{no es json');
    expect((await freshModule()).loadSelection()).toBeNull();
    sessionStorage.setItem('quinde.checkout', JSON.stringify({ outbound: { offer: {} } }));
    expect((await freshModule()).loadSelection()).toBeNull();
  });

  it('sin almacenamiento disponible conserva la selección en memoria', async () => {
    vi.stubGlobal('sessionStorage', undefined);
    const mod = await freshModule();
    mod.saveSelection(SELECTION);
    expect(mod.loadSelection()).toEqual(SELECTION);
  });

  it('suma ida y vuelta', async () => {
    expect((await freshModule()).selectionTotal(SELECTION)).toBe(200.35);
  });
});
