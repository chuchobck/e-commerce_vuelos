// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flightsApi, seatConflictError, type SeatMap } from '@/shared/api';
import { mockSeatMap } from '@/shared/api/mock/generators';
import { markSeatsTaken } from '@/shared/api/mock/seatSimulation';
import { es } from '@/shared/i18n';
import { clearSeatMapStore } from '../seatMapStore';
import { FAMILY, segmentsFor } from '../testSupport';
import type { SeatAssignments, SeatConflict, SeatPassenger } from '../types';
import { SeatSelector } from './SeatSelector';

const t = es.seats;
const { offerId, segments } = segmentsFor('UIO', 'GYE');
const SEGMENT = segments[0];

// El mapa del mock nace con todo libre (como la API real); aquí se ocupan algunos, como lo haría una reserva.
const withTakenSeats = (map: SeatMap) => markSeatsTaken(map, new Set(['20A', '20B', '20C', '21D']));

let maps: Map<string, SeatMap>;

beforeEach(() => {
  clearSeatMapStore();
  maps = new Map();
  vi.spyOn(flightsApi, 'getSeatMap').mockImplementation(async (offer, segment) => maps.get(segment) ?? withTakenSeats(mockSeatMap(offer, segment)));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

interface HarnessProps {
  passengers?: SeatPassenger[];
  initial?: SeatAssignments;
  serverError?: unknown;
  onChange?: (v: SeatAssignments) => void;
  onConflict?: (c: SeatConflict) => void;
}

function Harness({ passengers = FAMILY, initial = {}, serverError, onChange, onConflict }: HarnessProps) {
  const [value, setValue] = useState(initial);
  return (
    <SeatSelector
      offerId={offerId}
      segments={segments}
      passengers={passengers}
      value={value}
      serverError={serverError}
      onConflict={onConflict}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

/** Asiento por su número, sin importar el texto completo de su etiqueta. */
const seat = (number: string) => screen.getByRole('button', { name: new RegExp(`^Asiento ${number},`) });
const freeSeats = () => screen.getAllByRole('button', { name: /disponible$/ });

async function mapReady() {
  await screen.findByRole('button', { name: /^Asiento 10A,/ });
}

describe('selector de asientos: mapa y accesibilidad', () => {
  it('sin tocar nada no cambia el valor y dice que se asignará automáticamente', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await mapReady();
    expect(screen.getByText(t.autoAll)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cada asiento tiene un nombre completo: número, ubicación, características y estado', async () => {
    render(<Harness />);
    await mapReady();
    const label = seat('10A').getAttribute('aria-label')!;
    expect(label).toMatch(/^Asiento 10A, ventana, espacio extra, (disponible|ocupado)$/);
    expect(seat('12C').getAttribute('aria-label')).toMatch(/pasillo, salida de emergencia/);
    expect(seat('1A').getAttribute('aria-label')).toMatch(/de otra cabina/);
  });

  it('los asientos ocupados usan aria-disabled y siguen siendo enfocables', async () => {
    render(<Harness />);
    await mapReady();
    const taken = screen.getAllByRole('button', { name: /ocupado$/ })[0];
    expect(taken.getAttribute('aria-disabled')).toBe('true');
    expect(taken.hasAttribute('disabled')).toBe(false);
  });

  it('un solo punto de tabulación (roving) y flechas, Inicio y Fin', async () => {
    render(<Harness />);
    await mapReady();
    const grid = screen.getByRole('grid', { hidden: true });
    const tabbable = within(grid).getAllByRole('button', { hidden: true }).filter((b) => b.tabIndex === 0);
    expect(tabbable).toHaveLength(1);

    const start = tabbable[0];
    start.focus();
    const row = Number(/Asiento (\d+)/.exec(start.getAttribute('aria-label')!)![1]);
    fireEvent.keyDown(start, { key: 'ArrowRight' });
    const moved = document.activeElement as HTMLElement;
    expect(moved).not.toBe(start);
    expect(moved.tabIndex).toBe(0);
    expect(start.tabIndex).toBe(-1);
    fireEvent.keyDown(moved, { key: 'End' });
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toMatch(new RegExp(`^Asiento ${row}F,`));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toMatch(new RegExp(`^Asiento ${row}A,`));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toMatch(new RegExp(`^Asiento ${row + 1}A,`));
    fireEvent.keyDown(document.activeElement!, { key: 'End', ctrlKey: true });
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toMatch(/^Asiento 30F,/);
  });

  it('elegir un asiento lo anota, pasa al siguiente pasajero y no incluye al bebé', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await mapReady();
    const [first, second, third] = freeSeats().filter((b) => !/salida/.test(b.getAttribute('aria-label')!));
    const number = (b: HTMLElement) => /Asiento (\d+[A-F])/.exec(b.getAttribute('aria-label')!)![1];

    fireEvent.click(first);
    expect(onChange).toHaveBeenLastCalledWith({ p1: { [SEGMENT.id]: number(first) } });
    expect(screen.getByText(new RegExp(`Asiento ${number(first)} elegido para Ana. Ahora elige para Luis`))).toBeTruthy();
    expect(screen.getByRole('button', { name: /Luis/ }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(second);
    fireEvent.click(third);
    const last = onChange.mock.calls.at(-1)![0] as SeatAssignments;
    expect(Object.keys(last)).toEqual(['p1', 'p2', 'p3']);
    expect(screen.getByText(t.announceAllDone, { exact: false })).toBeTruthy();
    // El bebé se muestra pero no se puede elegir.
    expect(screen.getByText(new RegExp(t.infantLap))).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Mateo/ })).toBeNull();
  });

  it('volver a pulsar su asiento lo quita; el de otro pasajero no se puede tomar', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await mapReady();
    const free = freeSeats();
    fireEvent.click(free[0]);
    const takenByAna = /Asiento (\d+[A-F])/.exec(free[0].getAttribute('aria-label')!)![1];
    fireEvent.click(seat(takenByAna)); // ahora elige Luis
    expect(screen.getByRole('alert').textContent).toMatch(/ya lo elegiste para Ana/);
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /^Ana/ }));
    fireEvent.click(seat(takenByAna));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it('un asiento ocupado o de otra cabina avisa y no cambia nada', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await mapReady();
    fireEvent.click(screen.getAllByRole('button', { name: /ocupado$/ })[0]);
    expect(screen.getByRole('alert').textContent).toMatch(/está ocupado/);
    fireEvent.click(seat('1A'));
    expect(screen.getByRole('alert').textContent).toMatch(/otra cabina/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('zoom con botones, con límites', async () => {
    render(<Harness />);
    await mapReady();
    const out = screen.getByRole('button', { name: t.zoomOut });
    const zoomIn = screen.getByRole('button', { name: t.zoomIn });
    expect(out.getAttribute('disabled')).not.toBeNull();
    fireEvent.click(zoomIn);
    expect(screen.getByText('Zoom 125 %')).toBeTruthy();
    fireEvent.click(zoomIn);
    fireEvent.click(zoomIn);
    expect(zoomIn.getAttribute('disabled')).not.toBeNull();
    expect(screen.getByText('Zoom 200 %')).toBeTruthy();
  });

  it('"Recomiéndame" sienta juntos a quienes no tienen asiento y "Asignar automáticamente" los quita', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await mapReady();
    fireEvent.click(screen.getByRole('button', { name: t.recommend }));
    const value = onChange.mock.calls.at(-1)![0] as SeatAssignments;
    expect(Object.keys(value)).toEqual(['p1', 'p2', 'p3']);
    const seats = Object.values(value).map((b) => b[SEGMENT.id]);
    expect(new Set(seats).size).toBe(3);
    expect(new Set(seats.map((s) => parseInt(s, 10))).size).toBeLessThanOrEqual(2); // casi todos en la misma fila
    fireEvent.click(screen.getByRole('button', { name: t.autoSegment }));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it('los filtros se anuncian y atenúan lo que no coincide', async () => {
    render(<Harness />);
    await mapReady();
    fireEvent.click(screen.getByRole('button', { name: t.filterWindow }));
    expect(screen.getByRole('button', { name: t.filterWindow, pressed: true })).toBeTruthy();
    expect(screen.getByText(/asientos coinciden con tus filtros|asiento coincide/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /centro, disponible, no coincide con los filtros$/ }).length).toBeGreaterThan(0);
  });

  it('"Juntos" se desactiva con un solo pasajero con asiento', async () => {
    render(<Harness passengers={[FAMILY[0]]} />);
    await mapReady();
    expect(screen.getByRole('button', { name: t.filterTogether }).getAttribute('aria-disabled')).toBe('true');
  });
});

describe('selector de asientos: lista alternativa', () => {
  it('es equivalente al mapa: mismas acciones, filtros y estados', async () => {
    const onChange = vi.fn();
    render(<Harness passengers={[FAMILY[0]]} onChange={onChange} />);
    await mapReady();
    fireEvent.click(screen.getByRole('button', { name: t.viewList }));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').length).toBeGreaterThanOrEqual(3);
    const pick = within(table).getAllByRole('button', { name: /^Elegir .* para Ana$/ })[0];
    fireEvent.click(pick);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(within(screen.getByRole('table')).getByRole('button', { name: /^Quitar / })).toBeTruthy();
    // Los ocupados aparecen solo si se piden.
    expect(within(table).queryAllByText(t.stateTaken)).toHaveLength(0);
    fireEvent.click(screen.getByRole('checkbox', { name: t.showTaken }));
    expect(within(screen.getByRole('table')).getAllByText(t.stateTaken).length).toBeGreaterThan(0);
  });
});

describe('selector de asientos: estados y errores', () => {
  it('muestra carga y luego el mapa', async () => {
    render(<Harness />);
    expect(screen.getByText(t.loadingMap)).toBeTruthy();
    await mapReady();
  });

  it('error al cargar: mensaje claro y reintento', async () => {
    const spy = vi.spyOn(flightsApi, 'getSeatMap').mockRejectedValueOnce(Object.assign(new Error('x'), { status: 0 }));
    render(<Harness />);
    expect(await screen.findByText(t.errorTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: es.common.retry }));
    await mapReady();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('mapa sin asientos de la cabina: estado vacío que deja continuar', async () => {
    maps.set(SEGMENT.id, { segmentId: SEGMENT.id, cabins: [] });
    render(<Harness />);
    expect(await screen.findByText(t.emptyTitle)).toBeTruthy();
    expect(screen.getByText(t.emptyText)).toBeTruthy();
  });

  it('al volver a la pestaña refresca el mapa', async () => {
    render(<Harness />);
    await mapReady();
    const spy = vi.mocked(flightsApi.getSeatMap);
    spy.mockClear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 10_000);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    vi.useRealTimers();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it('SEAT_TAKEN (409): conserva lo demás, avisa, propone el más cercano y se puede aceptar', async () => {
    const onConflict = vi.fn();
    const onChange = vi.fn();
    const free = mockSeatMap(offerId, SEGMENT.id).cabins!.flatMap((c) => c.rows!).flatMap((r) => r.seats!).filter((s) => s.isAvailable && /^(1[4-9])/.test(s.seatNumber!));
    const [mine, other] = [free[0].seatNumber!, free[free.length - 1].seatNumber!];
    const { rerender } = render(<Harness initial={{ p1: { [SEGMENT.id]: mine }, p2: { [SEGMENT.id]: other } }} onConflict={onConflict} onChange={onChange} />);
    await mapReady();
    expect(onConflict).not.toHaveBeenCalled();

    // Alguien más compra `mine`: el siguiente mapa ya lo trae ocupado.
    const base = mockSeatMap(offerId, SEGMENT.id);
    maps.set(SEGMENT.id, {
      ...base,
      cabins: base.cabins!.map((c) => ({ ...c, rows: c.rows!.map((r) => ({ ...r, seats: r.seats!.map((s) => (s.seatNumber === mine ? { ...s, isAvailable: false } : s)) })) })),
    });
    rerender(<Harness initial={{ p1: { [SEGMENT.id]: mine }, p2: { [SEGMENT.id]: other } }} onConflict={onConflict} onChange={onChange} serverError={seatConflictError('SEAT_TAKEN')} />);

    const notice = await screen.findByText(t.conflictTakenTitle);
    expect(notice).toBeTruthy();
    await waitFor(() => expect(onConflict).toHaveBeenCalledTimes(1));
    const conflict = onConflict.mock.calls[0][0] as SeatConflict;
    expect(conflict).toMatchObject({ kind: 'SEAT_TAKEN', passengerId: 'p1', seatNumber: mine });
    expect(onChange).toHaveBeenLastCalledWith({ p2: { [SEGMENT.id]: other } });
    expect(screen.getAllByRole('alert').some((a) => a.textContent?.includes(mine))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: `Elegir ${conflict.alternative}` }));
    expect(onChange).toHaveBeenLastCalledWith({ p1: { [SEGMENT.id]: conflict.alternative }, p2: { [SEGMENT.id]: other } });
    expect(screen.queryByText(t.conflictTakenTitle)).toBeNull();
  });

  it('SEAT_CABIN_MISMATCH (422): explica en simple y ofrece asientos de la cabina correcta', async () => {
    const onChange = vi.fn();
    render(<Harness passengers={[FAMILY[0]]} initial={{ p1: { [SEGMENT.id]: '1A' } }} serverError={seatConflictError('SEAT_CABIN_MISMATCH')} onChange={onChange} />);
    expect(await screen.findByText(t.conflictCabinTitle)).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith({});
    expect(screen.getAllByText(/cabina Económica que compraste/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Ver asientos de la cabina Económica/ }));
    await waitFor(() => expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toMatch(/disponible$/));
  });

  it('un 409 sin asientos elegidos da un aviso general', async () => {
    render(<Harness passengers={[FAMILY[0]]} serverError={seatConflictError('SEAT_TAKEN')} />);
    expect(await screen.findByText(t.conflictTakenUnknown)).toBeTruthy();
  });

  it('un error que no es de asientos no hace nada', async () => {
    render(<Harness passengers={[FAMILY[0]]} serverError={new Error('otro')} />);
    await mapReady();
    expect(screen.queryByText(t.conflictTakenTitle)).toBeNull();
  });
});

describe('selector con varios tramos', () => {
  it('pestañas Ida / Vuelta con estado por tramo', async () => {
    const out = segmentsFor('CUE', 'GPS');
    const twoLegs = [...out.segments];
    expect(twoLegs.length).toBe(2);
    render(<SeatSelector offerId={out.offerId} segments={twoLegs} passengers={[FAMILY[0]]} value={{}} onChange={() => undefined} />);
    const tabs = await screen.findAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0].textContent).toMatch(/Ida, tramo 1 de 2/);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    expect(screen.getAllByRole('tab')[1].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel')).toBeTruthy();
  });
});
