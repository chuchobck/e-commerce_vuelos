// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { addDays } from 'date-fns';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, flightsApi, type SearchResult } from '@/shared/api';
import type { SearchResponseDto } from '@/shared/api/contract';
import searchFixture from '@/shared/api/__fixtures__/search-uio-gps-rt.json';
import { mapSearchResponse } from '@/shared/api/mapping';
import { es } from '@/shared/i18n';
import { toIsoDate, today } from '@/shared/lib/dates';
import { ResultsPage } from './ResultsPage';

const r = es.results;
const out = toIsoDate(addDays(today(), 5));
const back = toIsoDate(addDays(today(), 8));
const QUERY = `origen=UIO&destino=GPS&ida=${out}&vuelta=${back}&adultos=2&ninos=1&infantes=1&cabina=ECONOMY`;

function renderResults(query = QUERY) {
  return render(
    <MemoryRouter initialEntries={[`/resultados?${query}`]}>
      <Routes>
        <Route path="/resultados" element={<ResultsPage />} />
      </Routes>
    </MemoryRouter>,
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

  it('sin vuelos: sugiere otra fecha y dice hasta cuándo hay vuelos', async () => {
    vi.spyOn(flightsApi, 'search').mockResolvedValue({ params: {} as SearchResult['params'], offers: [] });
    renderResults();
    expect(await screen.findByText(r.emptyTitle)).toBeTruthy();
    expect(screen.getByText(/Por ahora hay vuelos hasta el/)).toBeTruthy();
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
    expect(screen.getByText(r.chooseOutboundFirst)).toBeTruthy();
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
