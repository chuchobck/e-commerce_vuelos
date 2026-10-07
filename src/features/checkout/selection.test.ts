import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fare, Itinerary } from '@/shared/api';
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

const usd = (cents: number) => ({ cents, currency: 'USD' });
const itinerary = { id: 'it_1', segments: [{ flightNumber: 'LA1400' }], fares: [] } as unknown as Itinerary;
const fare = { brand: 'CLASSIC', cabin: 'ECONOMY', total: usd(12010) } as unknown as Fare;
const back = { brand: 'BASIC', cabin: 'ECONOMY', total: usd(8025) } as unknown as Fare;

const SELECTION: CheckoutSelection = {
  offerId: 'off_1',
  outbound: { itinerary, fare },
  inbound: { itinerary: { ...itinerary, id: 'it_2' }, fare: back },
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
    // 120,10 + 80,25 en centavos: sin errores de coma flotante.
    expect((await freshModule()).selectionTotal(SELECTION)).toEqual(usd(20035));
  });
});
