import { describe, expect, it } from 'vitest';
import type { SearchResponseDto } from '../contract';
import realSearch from '../__fixtures__/search-uio-gps-rt.json';
import { mockSearch, mockSeatMap } from './generators';

// Respuesta real de la API local (2026-10-07): UIO→GPS el 09/10 y GPS→UIO el 12/10, 2 adultos, 1 joven, 1 niño y 1 infante.
const real = realSearch as SearchResponseDto;
const NOW = Date.parse('2026-10-07T12:00:00Z');

describe('el mock reproduce la API', () => {
  const mock = mockSearch(
    {
      itineraries: [
        { origin: 'UIO', destination: 'GPS', departureDate: '2026-10-09' },
        { origin: 'GPS', destination: 'UIO', departureDate: '2026-10-12' },
      ],
      passengers: { adults: 2, youths: 1, children: 1, infants: 1 },
    },
    NOW,
  );
  const realOffer = real.offers[0];
  const sameFlights = (o: (typeof mock.offers)[number]) =>
    o.itineraries.map((it) => it.segments.map((s) => s.flightNumber).join('+')).join('/') ===
    realOffer.itineraries.map((it) => it.segments.map((s) => s.flightNumber).join('+')).join('/');
  const mockOffer = mock.offers.find(sameFlights);

  it('ofrece la misma combinación de vuelos con las mismas horas UTC', () => {
    expect(mockOffer).toBeDefined();
    const times = (o: typeof realOffer) => o.itineraries.flatMap((it) => it.segments.map((s) => [s.departure.at, s.arrival.at]));
    expect(times(mockOffer!)).toEqual(times(realOffer));
  });

  it('con los mismos precios por familia y tipo de pasajero, al centavo', () => {
    const prices = (o: typeof realOffer) =>
      o.itineraries.map((it) =>
        it.pricingOptions.map((p) => [p.fareBrand, p.pricePerPassengerType.map((x) => `${x.passengerType}:${x.price?.total}`)]),
      );
    expect(prices(mockOffer!)).toEqual(prices(realOffer));
    expect(mockOffer!.grandTotal.total).toBe(realOffer.grandTotal.total);
  });

  it('fuera de la ventana de 90 días no hay vuelos (como la API: 200 sin ofertas)', () => {
    const far = mockSearch({ itineraries: [{ origin: 'UIO', destination: 'GYE', departureDate: '2027-06-01' }], passengers: { adults: 1 } }, NOW);
    expect(far).toEqual({ totalOffers: 0, offers: [] });
  });

  it('mapa de asientos con la forma del contrato y el diseño de cabinas de la semilla (A320)', () => {
    const offer = mock.offers[0];
    const segment = offer.itineraries[0].segments[0];
    const map = mockSeatMap(offer.offerId, segment.segmentId);
    expect(map.segmentId).toBe(segment.segmentId);
    expect(map.cabins?.map((c) => [c.cabinClass, c.rows?.length])).toEqual([
      ['BUSINESS', 3],
      ['ECONOMY', 21],
    ]);
    const firstEconomy = map.cabins![1].rows![0];
    expect(firstEconomy.rowNumber).toBe(10);
    expect(firstEconomy.seats?.[0]).toMatchObject({ seatNumber: '10A', characteristics: ['WINDOW', 'EXTRA_LEGROOM'] });
  });

  it('un segmento que no existe es 404', () => {
    expect(() => mockSeatMap(mock.offers[0].offerId, 'no-existe')).toThrowError(expect.objectContaining({ status: 404 }));
  });

  it('una fecha pasada es 400, como la API', () => {
    expect(() =>
      mockSearch({ itineraries: [{ origin: 'UIO', destination: 'GYE', departureDate: '2026-01-01' }], passengers: { adults: 1 } }, NOW),
    ).toThrowError(expect.objectContaining({ status: 400, code: 'VALIDATION_FAILED' }));
  });
});
