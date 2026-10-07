// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookingPassenger } from '@/shared/api';
import { es } from '@/shared/i18n';
import { PassengersForm } from './PassengersForm';
import type { CheckoutSelection } from './selection';

// jsdom no trae ResizeObserver (lo usa la casilla de Radix para medir).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const f = es.checkoutForms;
const leg = (departure: string) => ({ itinerary: { id: 'i', segments: [{ departureTime: departure }], durationMinutes: 50, stops: 0, fares: [] }, fare: {} }) as unknown as CheckoutSelection['outbound'];
const selection = (passengers: CheckoutSelection['passengers']): CheckoutSelection => ({
  offerId: 'o',
  outbound: leg('2026-12-01T06:00:00-05:00'),
  inbound: leg('2026-12-20T18:00:00-05:00'),
  passengers,
  searchQuery: '',
});

function setup(passengers: CheckoutSelection['passengers'], { draft = [] as BookingPassenger[], accountEmail = 'cuenta@example.test', rejected = [] as { field: string; message: string }[] } = {}) {
  const onDone = vi.fn();
  const onDraft = vi.fn();
  render(<PassengersForm selection={selection(passengers)} draft={draft} accountEmail={accountEmail} rejected={rejected} onDraft={onDraft} onDone={onDone} />);
  return { onDone, onDraft };
}

const field = (label: RegExp | string, n = 0) => screen.getAllByLabelText(label, { selector: 'input,select' })[n] as HTMLInputElement;
const change = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

/** Llena a un pasajero (el bloque `n`, desde 0) con datos válidos. */
function fill(n: number, over: Partial<Record<'first' | 'last' | 'doc' | 'birth', string>> = {}) {
  change(field(/^Nombres/, n), over.first ?? 'Ana María');
  change(field(/^Apellidos/, n), over.last ?? 'Pérez Gómez');
  change(field(/^Número de documento/, n), over.doc ?? '1710034065');
  change(field(/^Fecha de nacimiento/, n), over.birth ?? '15041990');
  change(field(/^Sexo según el documento/, n), 'F');
}

afterEach(cleanup);

describe('formulario de pasajeros', () => {
  it('un bloque (fieldset) por pasajero, numerado por tipo y con los campos de PassengerItem', () => {
    setup({ adults: 2, children: 1, infants: 1 });
    const legends = screen.getAllByRole('group').map((g) => g.querySelector('legend')?.textContent);
    expect(legends).toEqual(['Adulto 1', 'Adulto 2', 'Niño 1', 'Infante 1']);
    expect(screen.getAllByLabelText(/^Nombres/)).toHaveLength(4);
    expect(screen.getAllByLabelText(/^Nacionalidad/)).toHaveLength(4);
    // Cada tipo explica su regla de edad.
    expect(screen.getAllByText(new RegExp(f.birthRule.INFANT.replace('.', '\\.'))).length).toBeGreaterThan(0);
  });

  it('nacionalidad: lista de países en español; solo Ecuador se puede elegir (la API no conoce otros)', () => {
    setup({ adults: 1, children: 0, infants: 0 });
    const nat = field(/^Nacionalidad/);
    const options = within(nat).getAllByRole('option') as HTMLOptionElement[];
    expect(options[0].textContent).toBe('Ecuador');
    const colombia = options.find((o) => o.value === 'CO')!;
    expect(colombia.textContent).toContain('Colombia');
    expect(colombia.disabled).toBe(true);
    expect(options.find((o) => o.value === 'EC')!.disabled).toBe(false);
  });

  it('el infante elige el adulto que lo lleva; cada adulto lleva a lo sumo uno', async () => {
    setup({ adults: 2, children: 0, infants: 2 });
    change(field(/^Nombres/, 0), 'Ana');
    const who = field(/^Viaja en brazos de/, 0);
    expect(within(who).getAllByRole('option').map((o) => o.textContent)).toEqual([f.genderChoose, 'Adulto 1 · Ana', 'Adulto 2']);
    // Por defecto cada infante va con un adulto distinto.
    expect([field(/^Viaja en brazos de/, 0).value, field(/^Viaja en brazos de/, 1).value]).toEqual(['0', '1']);
    change(field(/^Viaja en brazos de/, 1), '0');
    fireEvent.submit(screen.getByRole('form', { name: es.purchase.passengersTitle }));
    expect(await screen.findAllByText(es.validation.oneInfantPerAdult)).toHaveLength(1);
  });

  it('con pasaporte pide el vencimiento; con cédula no', () => {
    setup({ adults: 1, children: 0, infants: 0 });
    expect(screen.queryByLabelText(/^Vencimiento del pasaporte/)).toBeNull();
    change(field(/^Documento/), 'PASSPORT');
    expect(screen.getByLabelText(/^Vencimiento del pasaporte/)).toBeTruthy();
  });

  it('solo dígitos y límites al teclear o pegar: cédula 10, celular 9; nombres hasta 60', () => {
    setup({ adults: 1, children: 0, infants: 0 });
    change(field(/^Número de documento/), '17a10-034 065xx99');
    expect(field(/^Número de documento/).value).toBe('1710034065');
    change(field(/^Celular/), '99-123 4567x89');
    expect(field(/^Celular/).value).toBe('991234567');
    expect(field(/^Nombres/).maxLength).toBe(60);
    // Con pasaporte se aceptan letras y se compacta.
    change(field(/^Documento/), 'PASSPORT');
    change(field(/^Número de documento/), 'ab-123 456');
    expect(field(/^Número de documento/).value).toBe('AB123456');
  });

  it('precarga el correo de la cuenta en el primer pasajero (no se pide dos veces)', () => {
    setup({ adults: 1, children: 0, infants: 0 });
    expect(field(/^Correo electrónico/).value).toBe('cuenta@example.test');
  });

  it('"mismo contacto para todos": los demás no piden correo ni celular, y el pedido los copia', async () => {
    const { onDone } = setup({ adults: 2, children: 0, infants: 0 });
    // Nace marcado: solo se pide un contacto; al desmarcar, cada pasajero tiene el suyo.
    const same = screen.getByRole('checkbox', { name: f.sameContact });
    expect(screen.getAllByLabelText(/^Correo electrónico/)).toHaveLength(1);
    fireEvent.click(same);
    await waitFor(() => expect(screen.getAllByLabelText(/^Correo electrónico/)).toHaveLength(2));
    fireEvent.click(same);
    await waitFor(() => expect(screen.getAllByLabelText(/^Correo electrónico/)).toHaveLength(1));
    fill(0);
    fill(1, { first: 'Luis', doc: '0926687856' });
    change(field(/^Celular/), '991234567');
    fireEvent.submit(screen.getByRole('form', { name: es.purchase.passengersTitle }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const sent = onDone.mock.calls[0][0] as BookingPassenger[];
    expect(sent.map((p) => [p.id, p.email, p.phone])).toEqual([
      ['PAX1', 'cuenta@example.test', '+593991234567'],
      ['PAX2', 'cuenta@example.test', '+593991234567'],
    ]);
  });

  it('enviar vacío: resumen de errores, error en cada campo y foco en el primero; no borra lo escrito', async () => {
    const { onDone } = setup({ adults: 1, children: 0, infants: 0 });
    change(field(/^Apellidos/), 'Pérez');
    fireEvent.submit(screen.getByRole('form', { name: es.purchase.passengersTitle }));
    const summary = await screen.findByText(/^Revisa \d+ campos?/);
    expect(summary.closest('[role="alert"]')).toBeTruthy();
    expect(within(summary.closest('[role="alert"]') as HTMLElement).getByText(/Pasajero 1 · Nombres/)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(field(/^Nombres/)));
    expect(field(/^Apellidos/).value).toBe('Pérez');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('valida al salir del campo (sin enviar)', async () => {
    setup({ adults: 1, children: 0, infants: 0 });
    const doc = field(/^Número de documento/);
    change(doc, '1710034066');
    fireEvent.blur(doc);
    expect(await screen.findByText(es.validation.cedulaInvalid)).toBeTruthy();
  });

  it('reglas de edad por tipo en la fecha del primer vuelo', async () => {
    setup({ adults: 1, children: 1, infants: 1 });
    change(field(/^Fecha de nacimiento/, 0), '01012010');
    fireEvent.blur(field(/^Fecha de nacimiento/, 0));
    expect(await screen.findByText(es.validation.birthAdult)).toBeTruthy();
    change(field(/^Fecha de nacimiento/, 1), '01062025');
    fireEvent.blur(field(/^Fecha de nacimiento/, 1));
    expect(await screen.findByText(es.validation.birthChild)).toBeTruthy();
    change(field(/^Fecha de nacimiento/, 2), '10122024');
    fireEvent.blur(field(/^Fecha de nacimiento/, 2));
    expect(await screen.findByText(es.validation.birthInfant)).toBeTruthy();
  });

  it('datos válidos de adulto e infante: se envía el pedido con el infante asociado a su adulto', async () => {
    const { onDone } = setup({ adults: 1, children: 0, infants: 1 });
    fill(0);
    fill(1, { first: 'Luz', last: 'Pérez Gómez', doc: '0926687856', birth: '01082025' });
    change(field(/^Celular/, 0), '991234567');
    fireEvent.submit(screen.getByRole('form', { name: es.purchase.passengersTitle }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    const sent = onDone.mock.calls[0][0] as BookingPassenger[];
    expect(sent.map((p) => [p.id, p.type, p.associatedAdultId])).toEqual([
      ['PAX1', 'ADULT', undefined],
      ['PAX2', 'INFANT', 'PAX1'],
    ]);
    expect(sent[0]).toMatchObject({ firstName: 'Ana María', birthDate: '1990-04-15', nationality: 'EC', gender: 'F' });
  });

  it('borrador: guarda lo escrito tras una pausa corta y lo recupera al volver (atrás, refrescar, hold vencido)', async () => {
    const first = setup({ adults: 1, children: 0, infants: 0 });
    change(field(/^Nombres/), 'Ana María');
    await waitFor(() => expect(first.onDraft).toHaveBeenCalled(), { timeout: 2000 });
    const saved = first.onDraft.mock.calls.at(-1)![0] as BookingPassenger[];
    expect(saved[0]).toMatchObject({ id: 'PAX1', firstName: 'Ana María' });
    cleanup();
    setup({ adults: 1, children: 0, infants: 0 }, { draft: saved });
    expect(field(/^Nombres/).value).toBe('Ana María');
  });

  it('un campo que la API rechazó al pagar se marca en su campo con foco', async () => {
    setup({ adults: 1, children: 0, infants: 0 }, { rejected: [{ field: 'passengers[0].birthDate', message: 'x' }] });
    expect(await screen.findByText(es.purchaseErrors.fieldRejected)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(field(/^Fecha de nacimiento/)));
  });
});
