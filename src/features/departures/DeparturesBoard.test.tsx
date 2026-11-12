// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Departure, DeparturesPage } from '@/shared/api';
import { ApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';

const api = vi.hoisted(() => ({ getDepartures: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/api')>()), flightsApi: api }));

import { DeparturesBoard, todayAt } from './DeparturesBoard';
import { REFRESH_MS } from './useDepartures';

const t = es.departures;

function dep(over: Partial<Departure> = {}): Departure {
  return {
    flightNumber: 'LA1400',
    airline: 'LATAM Airlines',
    destination: { code: 'GYE', city: 'Guayaquil' },
    scheduledTime: '2026-11-12T06:30:00-05:00',
    estimatedTime: null,
    status: 'SCHEDULED',
    terminal: null,
    gate: null,
    ...over,
  };
}

function page(departures: Departure[], nextCursor: string | null = null): DeparturesPage {
  return { airport: { code: 'UIO', name: 'Mariscal Sucre', city: 'Quito', timeZone: 'America/Guayaquil' }, date: '2026-11-12', departures, nextCursor };
}

/** Con timers falsos `findBy*` no avanza solo: se vacían las promesas a mano. */
const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));

beforeEach(() => {
  api.getDepartures.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('tablero de salidas', () => {
  it('tabla semántica con caption, columnas y la hora local tal cual llega (sin conversión)', async () => {
    api.getDepartures.mockResolvedValue(page([dep()]));
    render(<DeparturesBoard />);
    await flush();
    const table = screen.getByRole('table', { name: fmt(t.caption, { airport: 'Quito (UIO)', date: 'jueves 12 de noviembre de 2026' }) });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual([t.columns.time, t.columns.flight, t.columns.destination, t.columns.gate, t.columns.status]);
    // 06:30 es la hora de la cadena; no depende de la zona horaria del navegador de la prueba.
    expect(within(table).getByText('06:30')).toBeTruthy();
    expect(within(table).getByText('LA1400')).toBeTruthy();
    expect(within(table).getByText('Guayaquil')).toBeTruthy();
  });

  it('una hora con desfase de Galápagos también se muestra sin convertir', async () => {
    api.getDepartures.mockResolvedValue(page([dep({ scheduledTime: '2026-11-12T23:45:00-06:00' })]));
    render(<DeparturesBoard />);
    await flush();
    expect(screen.getByText('23:45')).toBeTruthy();
  });

  it('cada estado lleva texto (y su icono es decorativo): los siete, y las canceladas se incluyen', async () => {
    const statuses = ['SCHEDULED', 'BOARDING', 'DEPARTED', 'DELAYED', 'ARRIVED', 'CANCELLED', 'DIVERTED'] as const;
    api.getDepartures.mockResolvedValue(page(statuses.map((status, i) => dep({ flightNumber: `LA${1400 + i}`, status }))));
    const { container } = render(<DeparturesBoard />);
    await flush();
    for (const status of statuses) expect(screen.getByText(t.states[status])).toBeTruthy();
    expect(container.querySelectorAll('tbody svg[aria-hidden="true"]').length).toBe(statuses.length);
  });

  it('puerta nula → «—»; con puerta, la puerta', async () => {
    api.getDepartures.mockResolvedValue(page([dep(), dep({ flightNumber: 'AV1500', gate: 'A3' })]));
    render(<DeparturesBoard />);
    await flush();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText(t.noGate)).toBeTruthy();
    expect(within(rows[1]).getByText('A3')).toBeTruthy();
  });

  it('estimatedTime distinto → «Nueva hora»; igual o nulo → no aparece', async () => {
    api.getDepartures.mockResolvedValue(
      page([
        dep({ flightNumber: 'LA1', status: 'DELAYED', estimatedTime: '2026-11-12T06:55:00-05:00' }),
        dep({ flightNumber: 'LA2', estimatedTime: '2026-11-12T06:30:00-05:00' }),
        dep({ flightNumber: 'LA3' }),
      ]),
    );
    render(<DeparturesBoard />);
    await flush();
    expect(screen.getAllByText(/Nueva hora/)).toHaveLength(1);
    expect(screen.getByText(fmt(t.newTime, { time: '06:55' }))).toBeTruthy();
  });

  it('«Ver más» aparece con nextCursor y suma la página siguiente con ese cursor', async () => {
    api.getDepartures.mockResolvedValueOnce(page([dep()], 'c2')).mockResolvedValueOnce(page([dep({ flightNumber: 'AV1500' })], null));
    render(<DeparturesBoard />);
    await flush();
    expect(screen.queryByText('AV1500')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t.loadMore }));
    await flush();
    expect(api.getDepartures).toHaveBeenLastCalledWith('UIO', expect.any(String), expect.objectContaining({ cursor: 'c2' }));
    expect(screen.getByText('AV1500')).toBeTruthy();
    expect(screen.getByText('LA1400')).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.loadMore })).toBeNull();
  });

  it('sin salidas lo dice', async () => {
    api.getDepartures.mockResolvedValue(page([]));
    render(<DeparturesBoard />);
    await flush();
    expect(screen.getByText(t.empty)).toBeTruthy();
  });

  it('cambiar de aeropuerto pide el nuevo y no deja la tabla del anterior', async () => {
    api.getDepartures.mockResolvedValue(page([dep()]));
    render(<DeparturesBoard />);
    await flush();
    fireEvent.change(screen.getByLabelText(new RegExp(t.airport)), { target: { value: 'GYE' } });
    expect(screen.queryByText('LA1400')).toBeNull();
    await flush();
    expect(api.getDepartures).toHaveBeenLastCalledWith('GYE', expect.any(String), expect.anything());
  });
});

describe('actualización automática', () => {
  it('se actualiza cada 30 s y dice a qué hora', async () => {
    api.getDepartures.mockResolvedValue(page([dep()]));
    render(<DeparturesBoard />);
    await flush();
    expect(screen.getByText(/Actualizado a las \d{2}:\d{2}/)).toBeTruthy();
    expect(api.getDepartures).toHaveBeenCalledTimes(1);
    api.getDepartures.mockResolvedValue(page([dep({ status: 'BOARDING' })]));
    await act(async () => void (await vi.advanceTimersByTimeAsync(REFRESH_MS)));
    expect(api.getDepartures).toHaveBeenCalledTimes(2);
    expect(screen.getByText(t.states.BOARDING)).toBeTruthy();
  });

  it('con la pestaña oculta no pide nada; al volver, actualiza enseguida', async () => {
    api.getDepartures.mockResolvedValue(page([dep()]));
    render(<DeparturesBoard />);
    await flush();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(async () => void (await vi.advanceTimersByTimeAsync(REFRESH_MS * 3)));
    expect(api.getDepartures).toHaveBeenCalledTimes(1);
    hidden.mockReturnValue(false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.getDepartures).toHaveBeenCalledTimes(2);
  });

  it('si la actualización falla avisa y conserva la última tabla; al recuperarse el aviso se va', async () => {
    api.getDepartures.mockResolvedValue(page([dep()]));
    render(<DeparturesBoard />);
    await flush();
    api.getDepartures.mockRejectedValue(new ApiError({ status: 503, detail: 'DETALLE' }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(REFRESH_MS)));
    expect(screen.getByRole('alert').textContent).toContain(t.updateFailed);
    expect(screen.getByText('LA1400')).toBeTruthy();
    expect(document.body.textContent).not.toContain('DETALLE');
    api.getDepartures.mockResolvedValue(page([dep()]));
    await act(async () => void (await vi.advanceTimersByTimeAsync(REFRESH_MS)));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('si nunca cargó, lo dice y deja reintentar', async () => {
    api.getDepartures.mockRejectedValueOnce(new ApiError({ status: 500 })).mockResolvedValue(page([dep()]));
    render(<DeparturesBoard />);
    await flush();
    expect(screen.getByRole('alert').textContent).toContain(t.loadFailed);
    fireEvent.click(screen.getByRole('button', { name: t.retry }));
    await flush();
    expect(screen.getByText('LA1400')).toBeTruthy();
  });
});

describe('todayAt', () => {
  it('da la fecha de hoy en la zona del aeropuerto, no en la del navegador', () => {
    const now = new Date('2026-11-13T03:30:00Z'); // 22:30 del 12 en Ecuador continental, 21:30 en Galápagos
    expect(todayAt('America/Guayaquil', now)).toBe('2026-11-12');
    expect(todayAt('Pacific/Galapagos', now)).toBe('2026-11-12');
    expect(todayAt('Asia/Tokyo', now)).toBe('2026-11-13');
  });
});
