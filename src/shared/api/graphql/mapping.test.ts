import { describe, expect, it } from 'vitest';
import statusFixture from '../__fixtures__/status-la1400.json';
import type { FlightStatusDto } from '../contract';
import { mapFlightStatusData, mapSearchData, mapSeatMapData } from './mapping';
import type { FlightStatusData, SearchFlightsData } from './types';
import { SEAT_MAP_REST } from './__testing__/bffSimulator';

const money = (total: string) => ({ currency: 'USD', total });

function searchData(): SearchFlightsData {
  return {
    searchFlights: {
      totalOffers: 1,
      offers: [
        {
          offerId: 'o1',
          airline: { code: 'LA', name: 'LATAM Airlines' },
          grandTotal: money('420.42'),
          itineraries: [
            {
              itineraryId: 'i1',
              totalDurationMinutes: 235,
              stopsCount: 1,
              segments: [
                { segmentId: 's1', flightNumber: 'LA1400', departure: { iataCode: 'UIO', at: '2026-10-09T11:00:00.000Z' }, arrival: { iataCode: 'GYE', at: '2026-10-09T11:55:00.000Z' }, layoverMinutes: null, marketingCarrier: 'LA', operatingCarrier: 'LA', aircraft: null, durationMinutes: 55 },
                { segmentId: 's2', flightNumber: 'LA2410', departure: { iataCode: 'GYE', at: '2026-10-09T13:00:00.000Z' }, arrival: { iataCode: 'GPS', at: '2026-10-09T14:55:00.000Z' }, layoverMinutes: 65, marketingCarrier: 'LA', operatingCarrier: 'LA', aircraft: '320', durationMinutes: null },
              ],
              pricingOptions: [
                {
                  cabinClass: 'ECONOMY',
                  fareBrand: 'BASIC',
                  availableSeats: 9,
                  fareRules: { isRefundable: false, isChangeable: false },
                  baggageAllowance: { personalItemIncluded: true, carryOnIncluded: 0, checkedBaggageIncluded: 0 },
                  extraCheckedBaggagePrice: null,
                  pricePerPassengerType: [{ passengerType: 'ADULT', price: money('420.42') }],
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

describe('GraphQL → DTO de REST', () => {
  it('un null donde REST omite el campo pasa a campo ausente (layoverMinutes, extraCheckedBaggagePrice)', () => {
    const dto = mapSearchData(searchData());
    const [first, second] = dto.offers[0].itineraries[0].segments;
    expect('layoverMinutes' in first).toBe(false);
    expect(second.layoverMinutes).toBe(65);
    expect('extraCheckedBaggagePrice' in dto.offers[0].itineraries[0].pricingOptions[0]).toBe(false);
  });

  it('donde el contrato admite null (aircraft, durationMinutes) se conserva', () => {
    const [first, second] = mapSearchData(searchData()).offers[0].itineraries[0].segments;
    expect(first.aircraft).toBeNull();
    expect(second.durationMinutes).toBeNull();
  });

  it('el dinero sigue siendo texto decimal tal cual llega (sin pasar por número)', () => {
    const dto = mapSearchData(searchData());
    expect(dto.offers[0].grandTotal).toEqual({ currency: 'USD', total: '420.42' });
    expect(dto.offers[0].itineraries[0].pricingOptions[0].pricePerPassengerType[0].price).toEqual({ currency: 'USD', total: '420.42' });
  });

  it('no deja pasar campos que el DTO no define (p. ej. __typename)', () => {
    const data = searchData();
    (data.searchFlights.offers[0] as unknown as Record<string, unknown>).__typename = 'FlightOffer';
    expect(Object.keys(mapSearchData(data).offers[0]).sort()).toEqual(['airline', 'grandTotal', 'itineraries', 'offerId']);
  });

  it('el mapa de asientos queda igual a la forma de REST, con características vacías incluidas', () => {
    expect(mapSeatMapData({ seatMap: structuredClone(SEAT_MAP_REST) as unknown as Parameters<typeof mapSeatMapData>[0]['seatMap'] })).toEqual(SEAT_MAP_REST);
  });

  it('el estado de vuelo conserva null en terminal, estimatedAt y actualAt (el contrato lo admite)', () => {
    const rest = statusFixture as FlightStatusDto;
    const data = {
      flightStatus: { ...rest, aircraft: '320', departure: { ...rest.departure, terminal: null, estimatedAt: null, actualAt: null }, arrival: { ...rest.arrival, terminal: null, estimatedAt: null, actualAt: null } },
    } as FlightStatusData;
    expect(mapFlightStatusData(data)).toEqual(rest);
  });
});
