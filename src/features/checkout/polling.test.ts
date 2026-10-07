import { describe, expect, it, vi } from 'vitest';
import { ApiError, type Booking } from '@/shared/api';
import { pollBooking, pollDelay, POLL_LIMIT_MS } from './polling';

const booking = (status: Booking['status']) => ({ id: 'b', status }) as Booking;

function clock() {
  const c = { t: 0, waits: [] as number[] };
  return { c, sleep: async (ms: number) => void (c.waits.push(ms), (c.t += ms)), now: () => c.t };
}

describe('seguimiento de una reserva en proceso', () => {
  it('espera de forma creciente y luego cada 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(pollDelay)).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });

  it('se detiene en el primer estado final', async () => {
    const { c, sleep, now } = clock();
    const answers = [booking('PENDING_PAYMENT'), booking('TICKET_ISSUING'), booking('CONFIRMED')];
    const get = vi.fn(async () => answers.shift()!);
    expect(await pollBooking({ get, sleep, now })).toMatchObject({ status: 'CONFIRMED' });
    expect(c.waits).toEqual([2000, 4000, 8000]);
  });

  it('un error de red no corta el seguimiento', async () => {
    const { sleep, now } = clock();
    const get = vi.fn().mockRejectedValueOnce(new ApiError({ status: 0, code: 'NETWORK' })).mockResolvedValueOnce(booking('FAILED'));
    expect(await pollBooking({ get, sleep, now })).toMatchObject({ status: 'FAILED' });
  });

  it('pasado el tope de 2 minutos se rinde (null) sin pasarse del tope', async () => {
    const { c, sleep, now } = clock();
    const get = vi.fn(async () => booking('PENDING_PAYMENT'));
    expect(await pollBooking({ get, sleep, now })).toBeNull();
    expect(c.t).toBeLessThanOrEqual(POLL_LIMIT_MS);
    expect(get).toHaveBeenCalledTimes(c.waits.length);
  });

  it('se puede cancelar (salir de la pantalla)', async () => {
    const { sleep, now } = clock();
    const get = vi.fn(async () => booking('PENDING_PAYMENT'));
    expect(await pollBooking({ get, sleep, now, cancelled: () => true })).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
