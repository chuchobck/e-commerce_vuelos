import { describe, expect, it } from 'vitest';
import type { FlightOffer, Itinerary } from '@/shared/api';
import { escapeFromOffers } from './escapePrice';

const usd = (cents: number) => ({ cents, currency: 'USD' });
const it_ = (prices: number[], duration = 55, stops = 0) =>
  ({ id: 'x', segments: [], durationMinutes: duration, stops, fares: prices.map((c) => ({ cabin: 'ECONOMY', pricePerAdult: usd(c) })) }) as unknown as Itinerary;
const offer = (out: Itinerary, back?: Itinerary) => ({ id: 'o', itineraries: back ? [out, back] : [out] }) as unknown as FlightOffer;

describe('precio "desde" de Escápate', () => {
  it('suma la familia más barata de cada tramo y toma la oferta más barata (en centavos)', () => {
    const offers = [offer(it_([7150, 8580]), it_([7865])), offer(it_([6500, 9000], 120, 1), it_([9999]))];
    const e = escapeFromOffers('GYE', offers, (it) => it.fares);
    expect(e.price).toEqual(usd(7150 + 7865));
    expect(e.durationMinutes).toBe(55);
    expect(e.direct).toBe(true);
  });

  it('sin vuelta o sin ofertas no hay precio (nunca se inventa)', () => {
    expect(escapeFromOffers('GYE', [offer(it_([7150]))], (it) => it.fares).price).toBeNull();
    expect(escapeFromOffers('GYE', [], (it) => it.fares).price).toBeNull();
  });
});
