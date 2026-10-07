import { describe, expect, it } from 'vitest';
import type { components } from '@/shared/api/generated/vuelos';
import { seatMapFor } from '../testSupport';
import { matchesFilters, NO_FILTERS, togetherSeats } from './filters';
import { buildSeatLayout, countAvailable, type SeatLayout } from './layout';
import { nearestAvailable, recommendSeats } from './recommend';
import { reconcileSegment } from './reconcile';
import { assignSeat, clearSeat, holderOf, nextWithoutSeat, toAssignedSeats } from './selection';

const a320 = () => buildSeatLayout(seatMapFor('UIO', 'GYE').map);

/** Mapa a mano: una cabina 3-3 con los asientos que se indiquen ocupados. */
function smallLayout(taken: string[] = []): SeatLayout {
  const letters = 'ABCDEF';
  return buildSeatLayout({
    segmentId: 's',
    cabins: [
      {
        cabinClass: 'ECONOMY',
        rows: [10, 11, 12].map((rowNumber) => ({
          rowNumber,
          seats: [...letters].map((letter, i) => ({
            seatNumber: `${rowNumber}${letter}`,
            isAvailable: !taken.includes(`${rowNumber}${letter}`),
            characteristics: [
              ...(i === 0 || i === 5 ? (['WINDOW'] as const) : []),
              ...(i === 2 || i === 3 ? (['AISLE'] as const) : []),
            ],
          })),
        })),
      },
    ],
  });
}

describe('generación del mapa desde filas y letras', () => {
  it('A320: ejecutiva 1-3 con ACDF, económica 10-30 con ABCDEF, pasillo entre C y D', () => {
    const layout = a320();
    expect(layout.cabins.map((c) => [c.cabin, c.rows[0].row, c.rows.at(-1)!.row])).toEqual([
      ['BUSINESS', 1, 3],
      ['ECONOMY', 10, 30],
    ]);
    expect(layout.letters).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expect(layout.aisleAfter).toEqual(['C']);
    expect(layout.cabins[0].rows[0].seats.map((s) => s.letter)).toEqual(['A', 'C', 'D', 'F']);
    expect(layout.cabins[0].rows[0].groups.map((g) => g.length)).toEqual([2, 2]);
    expect(layout.cabins[1].rows[0].groups.map((g) => g.length)).toEqual([3, 3]);
  });

  it('primera fila de económica con espacio extra y salidas en las filas 12 y 13', () => {
    const layout = a320();
    const rows = new Map(layout.rows.map((r) => [r.row, r]));
    expect(rows.get(10)!.extraSpace).toBe(true);
    expect(rows.get(11)!.extraSpace).toBe(false);
    expect(layout.rows.filter((r) => r.exit).map((r) => r.row)).toEqual([12, 13]);
    expect(layout.rows.filter((r) => r.wing).map((r) => r.row)).toEqual([11, 12, 13, 14]);
  });

  it('A319 (business 1-2, economy 7-26) y ATR72 (1-18 ACDF, salidas 9-10)', () => {
    const a319 = buildSeatLayout(seatMapFor('CUE', 'GPS').map);
    expect(a319.cabins.map((c) => [c.cabin, c.rows[0].row, c.rows.at(-1)!.row])).toEqual([
      ['BUSINESS', 1, 2],
      ['ECONOMY', 7, 26],
    ]);
    const atr = buildSeatLayout(seatMapFor('UIO', 'OCC').map);
    expect(atr.letters).toEqual(['A', 'C', 'D', 'F']);
    expect(atr.aisleAfter).toEqual(['C']);
    expect(atr.cabins).toHaveLength(1);
    expect(atr.rows.at(-1)!.row).toBe(18);
    expect(atr.rows.filter((r) => r.exit).map((r) => r.row)).toEqual([9, 10]);
  });

  it('la ocupación del mock es estable y hay libres', () => {
    expect(countAvailable(a320(), 'ECONOMY')).toBe(countAvailable(a320(), 'ECONOMY'));
    expect(countAvailable(a320(), 'ECONOMY')).toBeGreaterThan(20);
  });

  it('tolera un mapa con campos que faltan (todo es opcional en el contrato)', () => {
    const layout = buildSeatLayout({
      cabins: [{ rows: [{ seats: [{ seatNumber: '5A' }, { seatNumber: 'xx' }, {}] }] }, { cabinClass: 'ECONOMY' }],
    });
    expect(layout.bySeat.get('5A')).toMatchObject({ available: false, window: false });
    expect(layout.bySeat.size).toBe(1);
    expect(buildSeatLayout({}).rows).toEqual([]);
  });
});

describe('selección', () => {
  it('asigna, quita y no deja entradas vacías', () => {
    let value = assignSeat({}, 'p1', 's1', '12A');
    value = assignSeat(value, 'p1', 's2', '14C');
    expect(holderOf(value, 's1', '12A')).toBe('p1');
    expect(toAssignedSeats(value, 'p1', [{ id: 's2' }, { id: 's1' }])).toEqual([
      { segmentId: 's2', seatNumber: '14C' },
      { segmentId: 's1', seatNumber: '12A' },
    ]);
    value = clearSeat(clearSeat(value, 'p1', 's1'), 'p1', 's2');
    expect(value).toEqual({});
    expect(toAssignedSeats(value, 'p1', [{ id: 's1' }])).toEqual([]);
  });

  it('lo que sale para el contrato es exactamente PassengerItem.assignedSeats', () => {
    type ContractSeats = NonNullable<components['schemas']['PassengerItem']['assignedSeats']>;
    const seats = toAssignedSeats({ p1: { s1: '12A' } }, 'p1', [{ id: 's1' }]) satisfies ContractSeats;
    expect(seats).toEqual([{ segmentId: 's1', seatNumber: '12A' }]);
  });

  it('pasa al siguiente pasajero sin asiento y se salta a los bebés', () => {
    const people = [
      { id: 'a', name: 'A', type: 'ADULT' as const },
      { id: 'b', name: 'B', type: 'INFANT' as const },
      { id: 'c', name: 'C', type: 'CHILD' as const },
    ];
    expect(nextWithoutSeat(people, {}, 's', 'a')?.id).toBe('c');
    expect(nextWithoutSeat(people, { c: { s: '1A' } }, 's', 'a')).toMatchObject({ id: 'a' });
    expect(nextWithoutSeat(people, { a: { s: '1A' }, c: { s: '1B' } }, 's', 'a')).toBeUndefined();
  });
});

describe('filtros', () => {
  const layout = smallLayout(['10B']);
  const seat = (n: string) => layout.bySeat.get(n)!;

  it('ventana, pasillo y más espacio', () => {
    expect(matchesFilters(seat('10A'), { ...NO_FILTERS, window: true })).toBe(true);
    expect(matchesFilters(seat('10B'), { ...NO_FILTERS, window: true })).toBe(false);
    expect(matchesFilters(seat('10C'), { ...NO_FILTERS, aisle: true })).toBe(true);
    expect(matchesFilters(seat('10C'), { ...NO_FILTERS, extraSpace: true })).toBe(false);
  });

  it('juntos: tiras de asientos libres seguidos sin cruzar el pasillo', () => {
    // Fila 10: B ocupado → A queda sola y C no tiene pareja del mismo lado; D-E-F sí.
    const pairs = togetherSeats(layout, 'ECONOMY', 2, (s) => s.available);
    expect(pairs.has('10A')).toBe(false);
    expect(pairs.has('10C')).toBe(false);
    expect(['10D', '10E', '10F', '11A', '11B', '11C'].every((n) => pairs.has(n))).toBe(true);
    const trio = togetherSeats(layout, 'ECONOMY', 3, (s) => s.available);
    expect(trio.has('10D')).toBe(true);
    expect(trio.has('10A')).toBe(false);
  });
});

describe('recomendación', () => {
  const base = { cabin: 'ECONOMY', filters: NO_FILTERS };

  it('un grupo se sienta junto', () => {
    const layout = smallLayout(['10A']);
    expect(recommendSeats(layout, { ...base, count: 3 })).toEqual(['10D', '10E', '10F']);
  });

  it('respeta ventana y no repite asientos bloqueados', () => {
    const layout = smallLayout();
    const [seat] = recommendSeats(layout, { ...base, count: 1, filters: { ...NO_FILTERS, window: true }, blocked: new Set(['10A']) });
    expect(seat).toBe('10F');
  });

  it('con menos asientos juntos que pasajeros, completa con los más cercanos', () => {
    const layout = smallLayout(['10B', '10E', '11B', '11E', '12B', '12E']);
    const seats = recommendSeats(layout, { ...base, count: 3 });
    expect(new Set(seats).size).toBe(3);
    expect(seats.every((n) => layout.bySeat.get(n)!.available)).toBe(true);
  });

  it('no recomienda salidas de emergencia si viaja un niño', () => {
    const layout = a320();
    const seats = recommendSeats(layout, { ...base, count: 4, avoidExit: true });
    expect(seats.some((n) => layout.bySeat.get(n)!.exit)).toBe(false);
  });

  it('sin asientos libres no recomienda nada', () => {
    expect(recommendSeats(smallLayout(['10A', '10B', '10C', '10D', '10E', '10F', '11A', '11B', '11C', '11D', '11E', '11F', '12A', '12B', '12C', '12D', '12E', '12F']), { ...base, count: 2 })).toEqual([]);
  });

  it('el alternativo más cercano prefiere la misma fila y el mismo tipo de lugar', () => {
    const layout = smallLayout(['11A']);
    expect(['11B', '10A', '12A']).toContain(nearestAvailable(layout, '11A', { cabin: 'ECONOMY' }));
    expect(nearestAvailable(layout, '11A', { cabin: 'ECONOMY', blocked: new Set(['11B', '10A', '12A']) })).not.toBeNull();
    expect(nearestAvailable(smallLayout(), '11A', { cabin: 'BUSINESS' })).toBeNull();
  });
});

describe('revisión contra un mapa nuevo (SEAT_TAKEN y cabina)', () => {
  const passengers = [
    { id: 'p1', name: 'Ana', type: 'ADULT' as const },
    { id: 'p2', name: 'Luis', type: 'ADULT' as const },
  ];

  it('quita solo el asiento ocupado, conserva el resto y propone otro', () => {
    const layout = smallLayout(['11A']);
    const value = { p1: { s: '11A', t: '5A' }, p2: { s: '12C' } };
    const { value: next, conflicts } = reconcileSegment(value, { id: 's', cabin: 'ECONOMY' }, layout, passengers);
    expect(next).toEqual({ p1: { t: '5A' }, p2: { s: '12C' } });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'SEAT_TAKEN', passengerId: 'p1', seatNumber: '11A' });
    expect(conflicts[0].alternative).toBeTruthy();
    expect(conflicts[0].alternative).not.toBe('12C');
  });

  it('un asiento de otra cabina es CABIN_MISMATCH', () => {
    const layout = a320();
    const { value, conflicts } = reconcileSegment({ p1: { s: '1A' } }, { id: 's', cabin: 'ECONOMY' }, layout, passengers);
    expect(value).toEqual({});
    expect(conflicts[0]).toMatchObject({ kind: 'CABIN_MISMATCH', seatNumber: '1A' });
    expect(layout.bySeat.get(conflicts[0].alternative!)!.cabin).toBe('ECONOMY');
  });

  it('sin conflictos devuelve el mismo valor', () => {
    const value = { p1: { s: '11B' } };
    expect(reconcileSegment(value, { id: 's', cabin: 'ECONOMY' }, smallLayout(), passengers).value).toBe(value);
  });
});
