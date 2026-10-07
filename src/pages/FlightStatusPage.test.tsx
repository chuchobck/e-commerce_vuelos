// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, flightsApi } from '@/shared/api';
import type { FlightStatusDto } from '@/shared/api/contract';
import statusFixture from '@/shared/api/__fixtures__/status-la1400.json';
import { mapFlightStatus } from '@/shared/api/mapping';
import { es } from '@/shared/i18n';
import { FlightStatusPage } from './FlightStatusPage';

const t = es.status;

function renderStatus() {
  render(
    <MemoryRouter>
      <FlightStatusPage />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByRole('textbox', { name: new RegExp(t.flightNumber) }), { target: { value: 'la1400' } });
  fireEvent.click(screen.getByRole('button', { name: t.submit }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('estado de vuelo', () => {
  it('vacío al inicio, sin llamar a la API', () => {
    const spy = vi.spyOn(flightsApi, 'getFlightStatus');
    render(
      <MemoryRouter>
        <FlightStatusPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(t.emptyTitle)).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it('consulta con el número en mayúsculas y muestra el estado del contrato', async () => {
    const spy = vi.spyOn(flightsApi, 'getFlightStatus').mockResolvedValue(mapFlightStatus(statusFixture as FlightStatusDto));
    renderStatus();
    expect(await screen.findByText(t.states.SCHEDULED)).toBeTruthy();
    expect(spy.mock.calls[0][0]).toBe('LA1400');
    expect(spy.mock.calls[0][1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(screen.getAllByText(t.noEstimate)).toHaveLength(2);
  });

  it('404: "no encontramos ese vuelo", anunciado como alerta', async () => {
    vi.spyOn(flightsApi, 'getFlightStatus').mockRejectedValue(new ApiError({ status: 404, code: 'VALIDATION_FAILED' }));
    renderStatus();
    expect((await screen.findByRole('alert')).textContent).toContain(t.notFoundTitle);
  });

  it('503: mensaje en español y opción de reintentar', async () => {
    vi.spyOn(flightsApi, 'getFlightStatus').mockRejectedValue(new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE' }));
    renderStatus();
    expect((await screen.findByRole('alert')).textContent).toContain(es.errors.unavailable503);
  });
});
