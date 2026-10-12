// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { addDays } from 'date-fns';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { es } from '@/shared/i18n';
import { toDisplayDate, today } from '@/shared/lib/dates';
import { SearchForm } from './SearchForm';

// jsdom no trae ResizeObserver (lo usan los paneles de Radix).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const s = es.search;

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function renderForm(initial = '/') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/" element={<SearchForm />} />
        <Route path="/resultados" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

const searchButton = () => screen.getByRole('button', { name: new RegExp(`^(${s.submit}|${s.submitShort})`) }) as HTMLButtonElement;
const origin = () => screen.getByRole('combobox', { name: new RegExp(`^${s.origin}`) }) as HTMLInputElement;
const destination = () => screen.getByRole('combobox', { name: new RegExp(`^${s.destination}`) }) as HTMLInputElement;
const date = (label: string) => screen.getByRole('textbox', { name: new RegExp(`^${label}`) }) as HTMLInputElement;

function pick(field: HTMLInputElement, typed: string, option: RegExp) {
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: typed } });
  fireEvent.click(screen.getByRole('option', { name: option }));
}

describe('buscador: sugerencias y corrección en tiempo real', () => {
  it('con los campos vacíos el botón está desactivado y dice qué falta', () => {
    renderForm();
    expect(searchButton().disabled).toBe(true);
    expect(screen.getByText(/Para buscar falta: origen, destino, salida y regreso\./i)).toBeTruthy();
  });

  it('escribir sugiere ciudades al instante (con tildes o sin ellas) y se elige con un clic', () => {
    renderForm();
    pick(origin(), 'guayaq', /Guayaquil/);
    expect(origin().value).toBe('Guayaquil (GYE)');
    fireEvent.focus(origin());
    fireEvent.change(origin(), { target: { value: 'galapa' } });
    // Por región: las dos ciudades de Galápagos.
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Baltra'), expect.stringContaining('San Cristóbal')]),
    );
  });

  it('el destino muestra por qué una ciudad no se puede elegir (sin vuelos o es el origen)', () => {
    renderForm();
    pick(origin(), 'guayaq', /Guayaquil/);
    fireEvent.focus(destination());
    expect(screen.getByRole('option', { name: /^Loja/ }).textContent).toContain('Sin vuelos desde Guayaquil');
    expect(screen.getByRole('option', { name: /^Guayaquil/ }).textContent).toContain(s.sameAsOrigin);
    expect(screen.getByRole('option', { name: /Quito/ }).getAttribute('aria-disabled')).toBeNull();
  });

  it('con todo lleno el botón se activa y busca con los datos en la URL', async () => {
    renderForm();
    pick(origin(), 'quito', /Quito/);
    pick(destination(), 'guayaq', /Guayaquil/);
    fireEvent.change(date(s.departDate), { target: { value: toDisplayDate(addDays(today(), 5)) } });
    fireEvent.change(date(s.returnDate), { target: { value: toDisplayDate(addDays(today(), 8)) } });
    await waitFor(() => expect(searchButton().disabled).toBe(false));
    expect(screen.getByText(s.ready)).toBeTruthy();
    fireEvent.click(searchButton());
    const where = await screen.findByTestId('where');
    expect(where.textContent).toContain('origen=UIO');
    expect(where.textContent).toContain('destino=GYE');
  });

  it('un regreso anterior a la salida se corrige al instante y desactiva el botón', async () => {
    renderForm();
    pick(origin(), 'quito', /Quito/);
    pick(destination(), 'guayaq', /Guayaquil/);
    fireEvent.change(date(s.departDate), { target: { value: toDisplayDate(addDays(today(), 8)) } });
    const back = date(s.returnDate);
    fireEvent.change(back, { target: { value: toDisplayDate(addDays(today(), 5)) } });
    fireEvent.blur(back);
    expect(await screen.findByText(es.validation.returnBeforeDeparture)).toBeTruthy();
    expect(searchButton().disabled).toBe(true);
    expect(screen.getByText(s.fixIssues)).toBeTruthy();
    // Se corrige y vuelve a estar listo.
    fireEvent.change(back, { target: { value: toDisplayDate(addDays(today(), 10)) } });
    await waitFor(() => expect(searchButton().disabled).toBe(false));
  });

  it('"Solo ida" no pide regreso', async () => {
    renderForm();
    fireEvent.click(screen.getByRole('radio', { name: s.oneWay }));
    expect(screen.getByText(/Para buscar falta: origen, destino y salida\./i)).toBeTruthy();
  });

  it('se prellena desde la URL ("Modificar búsqueda") y queda listo', async () => {
    const d = toDisplayDate(addDays(today(), 5)).split('/').reverse().join('-');
    renderForm(`/?origen=UIO&destino=GYE&ida=${d}&adultos=1&ninos=0&infantes=0&cabina=ECONOMY`);
    await waitFor(() => expect(origin().value).toBe('Quito (UIO)'));
    expect(destination().value).toBe('Guayaquil (GYE)');
    // Una búsqueda guardada sin regreso es "Solo ida": ya está lista.
    await waitFor(() => expect(searchButton().disabled).toBe(false));
  });
});
