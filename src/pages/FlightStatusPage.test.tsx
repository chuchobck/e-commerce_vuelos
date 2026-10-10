// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { es } from '@/shared/i18n';
import { FlightStatusPage } from './FlightStatusPage';

const t = es.status;

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

afterEach(cleanup);

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
