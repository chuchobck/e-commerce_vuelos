// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type CheckInResult } from '@/shared/api';

const api = vi.hoisted(() => ({ checkIn: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/api')>()), flightsApi: api }));

import { checkInProgress, useCheckIn } from './useCheckIn';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const authorized = <T,>(call: () => Promise<T>) => call();

const RESULT: CheckInResult = {
  bookingId: 'b',
  status: 'COMPLETED',
  passengers: [
    { passengerId: 'PAX1', status: 'CHECKED_IN', segments: [{ segmentId: 's1', seat: '14C', status: 'CHECKED_IN' }] },
    { passengerId: 'PAX2', status: 'CHECKED_IN', segments: [] },
  ],
};

let n = 0;
const bookingId = () => `checkin-${++n}`;

beforeEach(() => {
  api.checkIn.mockReset();
});

describe('check-in', () => {
  it('lo hace con una Idempotency-Key (UUID) y deja el resultado', async () => {
    const id = bookingId();
    api.checkIn.mockResolvedValue(RESULT);
    const { result } = renderHook(() => useCheckIn(id, authorized));
    await act(() => result.current.submit());
    expect(api.checkIn).toHaveBeenCalledWith(id, expect.stringMatching(UUID));
    expect(result.current.state).toEqual({ status: 'done', result: RESULT });
  });

  it('tras un error de red, reintentar reenvía la MISMA clave (no hace dos check-in)', async () => {
    const id = bookingId();
    api.checkIn.mockRejectedValueOnce(new ApiError({ status: 500 })).mockResolvedValue(RESULT);
    const { result } = renderHook(() => useCheckIn(id, authorized));
    await act(() => result.current.submit());
    expect(result.current.state.status).toBe('error');
    await act(() => result.current.submit());
    expect(result.current.state.status).toBe('done');
    expect(api.checkIn.mock.calls[1][1]).toBe(api.checkIn.mock.calls[0][1]);
  });

  it('el 409 de fuera de ventana se muestra como error y no cuenta como hecho', async () => {
    const id = bookingId();
    api.checkIn.mockRejectedValue(new ApiError({ status: 409, code: 'CHECK_IN_NOT_AVAILABLE' }));
    const { result } = renderHook(() => useCheckIn(id, authorized));
    await act(() => result.current.submit());
    expect(result.current.state).toMatchObject({ status: 'error' });
  });

  it('un doble clic mientras se procesa no manda un segundo check-in', async () => {
    const id = bookingId();
    let release: (value: CheckInResult) => void = () => undefined;
    api.checkIn.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    const { result } = renderHook(() => useCheckIn(id, authorized));
    let first!: Promise<CheckInResult | undefined>;
    act(() => {
      first = result.current.submit();
      void result.current.submit();
    });
    expect(api.checkIn).toHaveBeenCalledTimes(1);
    release(RESULT);
    await act(() => first);
  });

  it('un 403 sin permiso queda como error para el mensaje de permisos', async () => {
    const id = bookingId();
    api.checkIn.mockRejectedValue(new ApiError({ status: 403 }));
    const { result } = renderHook(() => useCheckIn(id, authorized));
    await act(() => result.current.submit());
    expect(result.current.state).toMatchObject({ status: 'error', error: expect.objectContaining({ status: 403 }) });
  });
});

describe('avance del check-in por vuelo', () => {
  it('todo registrado: los vuelos de los pasajeros con asiento cuentan; el infante (sin vuelos propios) no suma ni resta', () => {
    expect(checkInProgress(RESULT)).toEqual({ checked: 1, pending: 0 });
  });

  it('ida y vuelta con solo la ida abierta: la API deja al pasajero NOT_CHECKED_IN, pero la ida sí quedó registrada', () => {
    const partial: CheckInResult = {
      bookingId: 'b',
      status: 'IN_PROGRESS',
      passengers: [
        {
          passengerId: 'PAX1',
          status: 'NOT_CHECKED_IN',
          segments: [
            { segmentId: 'ida', seat: '14C', status: 'CHECKED_IN' },
            { segmentId: 'vuelta', seat: null, status: 'NOT_CHECKED_IN' },
          ],
        },
      ],
    };
    expect(checkInProgress(partial)).toEqual({ checked: 1, pending: 1 });
  });

  it('ningún vuelo registrado: 0 hechos', () => {
    const none: CheckInResult = { ...RESULT, status: 'IN_PROGRESS', passengers: [{ passengerId: 'PAX1', status: 'FAILED', segments: [{ segmentId: 's1', seat: null, status: 'FAILED' }] }] };
    expect(checkInProgress(none)).toEqual({ checked: 0, pending: 1 });
  });
});
