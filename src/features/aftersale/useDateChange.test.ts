// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type DateChangeOption, type DateChangeRequest } from '@/shared/api';

const api = vi.hoisted(() => ({ searchDateChange: vi.fn(), confirmDateChange: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/api')>()), flightsApi: api }));

import { useDateChange } from './useDateChange';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const authorized = <T,>(call: () => Promise<T>) => call();
const usd = (cents: number) => ({ cents, currency: 'USD' });

function option(id: string, totalCents: number): DateChangeOption {
  return {
    id,
    expiresAt: '2026-10-09T13:00:00Z',
    segments: [],
    price: { fare: usd(totalCents), taxes: usd(0), fee: usd(0), total: usd(totalCents) },
  };
}

let n = 0;
/** Un id de reserva nuevo por prueba: las claves de idempotencia se guardan por reserva. */
function setup() {
  const bookingId = `booking-${++n}`;
  const onChanged = vi.fn();
  const hook = renderHook(() => useDateChange(bookingId, authorized, onChanged));
  return { ...hook, bookingId, onChanged };
}

async function toConfirm(hook: ReturnType<typeof setup>, offer: DateChangeOption) {
  api.searchDateChange.mockResolvedValue([offer]);
  await act(() => hook.result.current.search('it1', '2026-11-21'));
  act(() => hook.result.current.choose(offer));
  await vi.waitFor(() => expect(hook.result.current.state.step).toBe('confirm'));
}

const requests = () => api.confirmDateChange.mock.calls as [string, DateChangeRequest, string][];

beforeEach(() => {
  api.searchDateChange.mockReset();
  api.confirmDateChange.mockReset();
});

describe('cambio de fecha: pasos y resultados', () => {
  it('buscar es una lectura que pide las alternativas del itinerario y pasa a "elegir"', async () => {
    const hook = setup();
    api.searchDateChange.mockResolvedValue([option('o1', 2500), option('o2', 4000)]);
    await act(() => hook.result.current.search('it1', '2026-11-21'));
    expect(api.searchDateChange).toHaveBeenCalledWith(hook.bookingId, [{ itineraryId: 'it1', newDepartureDate: '2026-11-21' }]);
    expect(hook.result.current.state).toMatchObject({ step: 'options', date: '2026-11-21', searching: false });
    expect(hook.result.current.state.options).toHaveLength(2);
  });

  it('un error de la búsqueda se queda en el paso de búsqueda para poder reintentar', async () => {
    const hook = setup();
    api.searchDateChange.mockRejectedValue(new ApiError({ status: 409, code: 'FARE_NOT_CHANGEABLE' }));
    await act(() => hook.result.current.search('it1', '2026-11-21'));
    expect(hook.result.current.state.step).toBe('search');
    expect(hook.result.current.state.searchError).toBeInstanceOf(ApiError);
  });

  it('200: queda hecho, avisa para refrescar la reserva y la petición lleva el pago y una Idempotency-Key (UUID)', async () => {
    const hook = setup();
    await toConfirm(hook, option('o1', 2500));
    api.confirmDateChange.mockResolvedValue({ status: 'done', data: null });
    await act(() => hook.result.current.confirm('PAY-OK-ABCD1234'));
    expect(hook.result.current.state).toMatchObject({ step: 'result', outcome: 'done' });
    expect(hook.onChanged).toHaveBeenCalledTimes(1);
    const [bookingId, request, key] = requests()[0];
    expect(bookingId).toBe(hook.bookingId);
    expect(request).toEqual({ changeOfferId: 'o1', paymentReference: 'PAY-OK-ABCD1234' });
    expect(key).toMatch(UUID);
  });

  it('si el cambio no cuesta o devuelve dinero, no se manda pago', async () => {
    for (const total of [0, -1500]) {
      const hook = setup();
      await toConfirm(hook, option('o1', total));
      api.confirmDateChange.mockResolvedValue({ status: 'done', data: null });
      await act(() => hook.result.current.confirm('PAY-OK-ABCD1234'));
      expect(requests().at(-1)?.[1]).toEqual({ changeOfferId: 'o1' });
    }
  });

  it('202: queda "en proceso" y reintentar el mismo cambio con el mismo pago reenvía la misma clave', async () => {
    const hook = setup();
    await toConfirm(hook, option('o1', 2500));
    api.confirmDateChange.mockResolvedValue({ status: 'pending' });
    await act(() => hook.result.current.confirm('PAY-PEND-ABCD1234'));
    expect(hook.result.current.state).toMatchObject({ step: 'result', outcome: 'pending' });

    act(() => hook.result.current.reset());
    await toConfirm(hook, option('o1', 2500));
    await act(() => hook.result.current.confirm('PAY-PEND-ABCD1234'));
    expect(requests()[1][2]).toBe(requests()[0][2]);
  });

  it('422 de pago rechazado: conserva la elección en el paso de confirmar; otro pago usa otra clave y funciona', async () => {
    const hook = setup();
    const chosen = option('o1', 2500);
    await toConfirm(hook, chosen);
    api.confirmDateChange.mockRejectedValueOnce(new ApiError({ status: 422, code: 'PAYMENT_NOT_AUTHORIZED' })).mockResolvedValue({ status: 'done', data: null });
    await act(() => hook.result.current.confirm('PAY-REJ-ABCD1234'));
    expect(hook.result.current.state).toMatchObject({ step: 'confirm', problem: 'rejected', confirming: false, chosen });
    expect(hook.onChanged).not.toHaveBeenCalled();

    await act(() => hook.result.current.confirm('PAY-OK-WXYZ5678'));
    expect(hook.result.current.state).toMatchObject({ step: 'result', outcome: 'done' });
    expect(requests()[1][1]).toEqual({ changeOfferId: 'o1', paymentReference: 'PAY-OK-WXYZ5678' });
    expect(requests()[1][2]).not.toBe(requests()[0][2]);
  });

  it('un error de red al confirmar no pierde la elección; reintentar con el mismo pago reenvía la misma clave', async () => {
    const hook = setup();
    await toConfirm(hook, option('o1', 2500));
    api.confirmDateChange.mockRejectedValueOnce(new ApiError({ status: 500 })).mockResolvedValue({ status: 'done', data: null });
    await act(() => hook.result.current.confirm('PAY-OK-ABCD1234'));
    expect(hook.result.current.state).toMatchObject({ step: 'confirm', problem: 'other' });
    await act(() => hook.result.current.confirm('PAY-OK-ABCD1234'));
    expect(requests()[1][2]).toBe(requests()[0][2]);
  });

  it('410 CHANGE_OFFER_EXPIRED: la oferta venció y se vuelve a la búsqueda con el aviso, conservando la fecha', async () => {
    const hook = setup();
    await toConfirm(hook, option('o1', 2500));
    api.confirmDateChange.mockRejectedValue(new ApiError({ status: 410, code: 'CHANGE_OFFER_EXPIRED' }));
    await act(() => hook.result.current.confirm('PAY-OK-ABCD1234'));
    expect(hook.result.current.state).toMatchObject({ step: 'search', date: '2026-11-21', chosen: null });
    expect(hook.result.current.state.searchError).toBeInstanceOf(ApiError);
  });

  it('un doble clic en confirmar no manda dos cambios', async () => {
    const hook = setup();
    await toConfirm(hook, option('o1', 2500));
    let release: (value: unknown) => void = () => undefined;
    api.confirmDateChange.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    let first!: Promise<void>;
    act(() => {
      first = hook.result.current.confirm('PAY-OK-ABCD1234');
      void hook.result.current.confirm('PAY-OK-ABCD1234');
    });
    expect(api.confirmDateChange).toHaveBeenCalledTimes(1);
    release({ status: 'done', data: null });
    await act(() => first);
  });
});
