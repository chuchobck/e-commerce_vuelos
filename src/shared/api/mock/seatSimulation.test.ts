import { afterEach, describe, expect, it } from 'vitest';
import { mockSearch, mockSeatMap } from './generators';
import { applySimulatedSeats, clearSeatSimulation, seatConflictError, simulateSeatTaken } from './seatSimulation';

afterEach(clearSeatSimulation);

const NOW = Date.now();
const offer = mockSearch({ itineraries: [{ origin: 'UIO', destination: 'GYE', departureDate: new Date(NOW + 7 * 864e5).toISOString().slice(0, 10) }], passengers: { adults: 1 } }, NOW).offers![0];
const segmentId = offer.itineraries[0].segments[0].segmentId;

describe('simulación de asientos ocupados del mock', () => {
  it('el mapa es determinista (misma oferta y tramo, mismo mapa)', () => {
    expect(mockSeatMap(offer.offerId, segmentId)).toEqual(mockSeatMap(offer.offerId, segmentId));
  });

  it('un asiento simulado como ocupado sale con isAvailable false y el resto no cambia', () => {
    const base = mockSeatMap(offer.offerId, segmentId);
    const free = base.cabins![1].rows!.flatMap((r) => r.seats!).find((s) => s.isAvailable)!;
    expect(applySimulatedSeats(base)).toBe(base);
    simulateSeatTaken(segmentId, free.seatNumber!);
    const after = applySimulatedSeats(base);
    const all = (m: typeof base) => m.cabins!.flatMap((c) => c.rows!).flatMap((r) => r.seats!);
    expect(all(after).find((s) => s.seatNumber === free.seatNumber)!.isAvailable).toBe(false);
    expect(all(after).filter((s) => s.isAvailable).length).toBe(all(base).filter((s) => s.isAvailable).length - 1);
    expect(all(base).find((s) => s.seatNumber === free.seatNumber)!.isAvailable).toBe(true);
  });

  it('los errores simulados son el 409 SEAT_TAKEN y el 422 SEAT_CABIN_MISMATCH', () => {
    expect(seatConflictError('SEAT_TAKEN')).toMatchObject({ status: 409, code: 'SEAT_TAKEN' });
    expect(seatConflictError('SEAT_CABIN_MISMATCH')).toMatchObject({ status: 422, code: 'SEAT_CABIN_MISMATCH' });
  });
});
