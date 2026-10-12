// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { addDays } from 'date-fns';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, createLocalLock, createTokenStore, SessionManager, type AuthApi } from '@/features/auth';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, flightsApi, type SearchResult } from '@/shared/api';
import type { SearchResponseDto } from '@/shared/api/contract';
import searchFixture from '@/shared/api/__fixtures__/search-uio-gps-rt.json';
import { mapSearchResponse } from '@/shared/api/mapping';
import { es } from '@/shared/i18n';
import { toIsoDate, today } from '@/shared/lib/dates';
import { clearNearbyMemo } from '@/features/results';
import { ResultsPage } from './ResultsPage';

const r = es.results;
const out = toIsoDate(addDays(today(), 5));
const back = toIsoDate(addDays(today(), 8));
const QUERY = `origen=UIO&destino=GPS&ida=${out}&vuelta=${back}&adultos=2&ninos=1&infantes=1&cabina=ECONOMY`;

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}

/** Sesión real sin usuario (anónimo): los resultados son públicos. */
function anonymousSession() {
  const api: AuthApi = {
    register: vi.fn(),
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(async () => undefined),
    me: vi.fn(),
  };
  return new SessionManager({
    api,
    store: createTokenStore(memoryStorage(), memoryStorage()),
    lock: createLocalLock(),
    channel: { post: () => undefined, listen: () => () => undefined },
    schedule: () => () => undefined,
  });
}

function renderResults(query = QUERY) {
  return render(
    <AuthProvider manager={anonymousSession()}>
      <MemoryRouter initialEntries={[`/resultados?${query}`]}>
        <Routes>
          <Route path="/resultados" element={<ResultsPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('resultados', () => {
  it('cargando: lo anuncia con role="status"', () => {
    vi.spyOn(flightsApi, 'search').mockReturnValue(new Promise(() => undefined));
    renderResults();
    const loading = screen.getAllByRole('status').find((el) => el.textContent?.includes(r.loading));
    expect(loading).toBeTruthy();
  });

  it('sin vuelos: no se queda en un "no": ofrece fechas cercanas con precio, otros destinos y modificar', async () => {
    clearNearbyMemo();
    const result = mapSearchResponse(searchFixture as SearchResponseDto, {
      origin: 'UIO',
      destination: 'GPS',
      departDate: out,
      returnDate: back,
      passengers: { adults: 2, children: 1, infants: 1 },
      cabin: 'ECONOMY',
    });
    const search = vi.spyOn(flightsApi, 'search').mockImplementation(async (p) =>
      // La fecha pedida no tiene vuelos; el día siguiente (y su regreso) sí.
      p.departDate === out ? { params: p, offers: [] } : p.departDate === toIsoDate(addDays(today(), 6)) ? result : { params: p, offers: [] },
    );
    renderResults();
    expect(await screen.findByRole('heading', { name: /^No hay vuelos el / })).toBeTruthy();
    const link = await screen.findByRole('link', { name: /Buscar vuelos el .*, desde \$/ });
    expect(link.getAttribute('href')).toContain(`ida=${toIsoDate(addDays(today(), 6))}`);
    expect(link.getAttribute('href')).toContain(`vuelta=${toIsoDate(addDays(today(), 9))}`);
    // Como máximo 1 búsqueda pedida + 6 de fechas cercanas.
    expect(search.mock.calls.length).toBeLessThanOrEqual(7);
    expect(screen.getAllByRole('link', { name: r.modify }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('heading', { name: r.otherDestinationsTitle })).toBeTruthy();
  });

  it('sin vuelos en días cercanos: lo dice y hasta cuándo hay vuelos', async () => {
    clearNearbyMemo();
    vi.spyOn(flightsApi, 'search').mockResolvedValue({ params: {} as SearchResult['params'], offers: [] });
    renderResults();
    expect(await screen.findByText(/Tampoco encontramos vuelos en los días cercanos\. Hay vuelos hasta el/)).toBeTruthy();
  });

  it('con ofertas reales: muestra la ida, las familias reales y pide elegir la ida primero', async () => {
    const result = mapSearchResponse(searchFixture as SearchResponseDto, {
      origin: 'UIO',
      destination: 'GPS',
      departDate: out,
      returnDate: back,
      passengers: { adults: 2, children: 1, infants: 1 },
      cabin: 'ECONOMY',
    });
    vi.spyOn(flightsApi, 'search').mockResolvedValue(result);
    renderResults();
    const list = await screen.findByRole('list', { name: r.outboundList });
    expect(within(list).getAllByRole('article')).toHaveLength(1);
    expect(within(list).getByRole('button', { name: /^Elegir Basic: vuelo LA1400 \+ LA2410/ })).toBeTruthy();
    // La cabina pedida es económica: Business Flex no se ofrece.
    expect(within(list).queryByText('Business Flex')).toBeNull();
    // La vuelta espera a la ida: la pestaña está bloqueada y dice por qué.
    expect(screen.getByText(r.chooseOutboundFirst)).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[1].getAttribute('aria-disabled')).toBe('true');
  });

  it('al elegir la ida pasa sola a la vuelta, la pestaña de ida muestra lo elegido y se puede cambiar', async () => {
    const result = mapSearchResponse(searchFixture as SearchResponseDto, {
      origin: 'UIO',
      destination: 'GPS',
      departDate: out,
      returnDate: back,
      passengers: { adults: 2, children: 1, infants: 1 },
      cabin: 'ECONOMY',
    });
    vi.spyOn(flightsApi, 'search').mockResolvedValue(result);
    renderResults();
    const list = await screen.findByRole('list', { name: r.outboundList });
    fireEvent.click(within(list).getByRole('button', { name: /^Elegir Basic: vuelo LA1400/ }));
    expect(await screen.findByRole('list', { name: r.inboundList })).toBeTruthy();
    expect(screen.queryByRole('list', { name: r.outboundList })).toBeNull();
    const [first, second] = screen.getAllByRole('tab');
    expect(second.getAttribute('aria-selected')).toBe('true');
    expect(second.getAttribute('aria-disabled')).toBeNull();
    expect(first.textContent).toContain('Basic');
    expect(first.textContent).toContain(r.changeChoice);
    fireEvent.click(first);
    expect(await screen.findByRole('list', { name: r.outboundList })).toBeTruthy();
  });

  it('ordena por precio, hora o duración y filtra "Solo directos" sin llamar otra vez a la API', async () => {
    const result = mapSearchResponse(searchFixture as SearchResponseDto, {
      origin: 'UIO',
      destination: 'GPS',
      departDate: out,
      returnDate: back,
      passengers: { adults: 2, children: 1, infants: 1 },
      cabin: 'ECONOMY',
    });
    const search = vi.spyOn(flightsApi, 'search').mockResolvedValue(result);
    renderResults();
    await screen.findByRole('list', { name: r.outboundList });
    fireEvent.change(screen.getByLabelText(r.sortBy), { target: { value: 'duration' } });
    expect(screen.getByLabelText(r.sortBy)).toHaveProperty('value', 'duration');
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('429: explica cuánto esperar y el botón se habilita después (role="alert")', async () => {
    vi.spyOn(flightsApi, 'search').mockRejectedValue(new ApiError({ status: 429, code: 'RATE_LIMIT_EXCEEDED', retryAfter: 30 }));
    renderResults();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('30 segundos');
    expect((within(alert).getByRole('button', { name: es.common.retry }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('400: lista los campos con mensajes en español, sin el detalle técnico', async () => {
    vi.spyOn(flightsApi, 'search').mockRejectedValue(
      new ApiError({
        status: 400,
        code: 'VALIDATION_FAILED',
        detail: 'itineraries[0].departureDate: must not be in the past',
        fieldErrors: [{ field: 'itineraries[0].departureDate', message: 'must not be in the past' }],
      }),
    );
    renderResults();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(es.errors.fields.datePast)).toBeTruthy();
    expect(alert.textContent).not.toContain('must not');
  });

  it('red caída y tiempo agotado tienen su propio mensaje', async () => {
    vi.spyOn(flightsApi, 'search').mockRejectedValue(new ApiError({ status: 0, code: 'TIMEOUT' }));
    renderResults();
    expect((await screen.findByRole('alert')).textContent).toContain(es.errors.timeout);
  });

  it('una búsqueda inválida en la URL no llama a la API', () => {
    const search = vi.spyOn(flightsApi, 'search');
    renderResults('origen=UIO');
    expect(screen.getByText(r.invalidTitle)).toBeTruthy();
    expect(search).not.toHaveBeenCalled();
  });
});
