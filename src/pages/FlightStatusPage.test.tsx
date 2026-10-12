// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function renderPage() {
  return render(
    <MemoryRouter>
      <FlightStatusPage />
    </MemoryRouter>,
  );
}

const flight = () => screen.getByLabelText(new RegExp(`^${t.flightNumber}`)) as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: new RegExp(t.submit) }) as HTMLButtonElement;
const statusText = () => document.getElementById('status-form')?.textContent ?? '';

describe('estado de vuelo: validación en vivo, sin resumen de errores', () => {
  it('al abrir, «Consultar» está desactivado, dice qué falta y no hay ninguna caja de error', () => {
    renderPage();
    expect(submit().disabled).toBe(true);
    expect(statusText()).toContain('Falta completar: número de vuelo');
    expect(screen.queryByText(/^Revisa \d+ campos?/)).toBeNull();
    expect(screen.queryAllByRole('alert')).toHaveLength(0);
  });

  it('el número de vuelo se pasa a mayúsculas y quita espacios y signos mientras se escribe', () => {
    renderPage();
    fireEvent.change(flight(), { target: { value: 'la 14-00' } });
    expect(flight().value).toBe('LA1400');
  });

  it('con un número válido y la fecha de hoy, el botón se activa y el estado lo dice', async () => {
    renderPage();
    fireEvent.change(flight(), { target: { value: 'LA1400' } });
    await waitFor(() => expect(submit().disabled).toBe(false));
    expect(statusText()).toContain(t.ready);
  });

  it('un número que no es de vuelo (por ejemplo un código de reserva) se explica junto al campo al salir de él, sin repetirse arriba', async () => {
    renderPage();
    fireEvent.change(flight(), { target: { value: '7T37GQ' } });
    expect(screen.queryByText(es.validation.flightNumber)).toBeNull(); // aún escribiendo: no se regaña
    fireEvent.blur(flight());
    const messages = await screen.findAllByText(es.validation.flightNumber);
    expect(messages).toHaveLength(1);
    expect(submit().disabled).toBe(true);
    expect(statusText()).toContain('Revisa: número de vuelo');
    expect(flight().getAttribute('aria-invalid')).toBe('true');
  });

  it('el mensaje se va solo cuando el dato se corrige', async () => {
    renderPage();
    fireEvent.change(flight(), { target: { value: '7T37GQ' } });
    fireEvent.blur(flight());
    await screen.findByText(es.validation.flightNumber);
    fireEvent.change(flight(), { target: { value: 'LA1400' } });
    await waitFor(() => expect(screen.queryByText(es.validation.flightNumber)).toBeNull());
  });

  it('la fecha no deja escribir un mes mayor a 12', () => {
    renderPage();
    const date = screen.getByLabelText(new RegExp(`^${t.date}`)) as HTMLInputElement;
    fireEvent.change(date, { target: { value: '1513' } });
    expect(date.value).toBe('15/1');
  });
});
