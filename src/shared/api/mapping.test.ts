import { describe, expect, it } from 'vitest';
import type { FlightStatusDto, SearchResponseDto } from './contract';
import searchFixture from './__fixtures__/search-uio-gps-rt.json';
import statusFixture from './__fixtures__/status-la1400.json';
import { faresForCabin, mapFare, mapFlightStatus, mapSearchResponse, toAirportLocalIso, toSearchRequest } from './mapping';
import type { SearchParams } from './types';

// Respuestas reales de la API local (2026-10-07). La validación estricta contra el esquema la hace `npm run test:api` (Ajv).
const search = searchFixture as SearchResponseDto;
const status = statusFixture as FlightStatusDto;

const PARAMS: SearchParams = {
  origin: 'UIO',
  destination: 'GPS',
  departDate: '2026-10-09',
  returnDate: '2026-10-12',
  passengers: { adults: 2, children: 1, infants: 1 },
  cabin: 'ECONOMY',
};

describe('toAirportLocalIso', () => {
  it('pasa de UTC a la hora local del aeropuerto (Ecuador continental UTC−5)', () => {
    expect(toAirportLocalIso('2026-10-09T11:00:00.000Z', 'UIO')).toBe('2026-10-09T06:00:00-05:00');
  });
  it('Galápagos va en UTC−6', () => {
    expect(toAirportLocalIso('2026-10-09T14:55:00.000Z', 'GPS')).toBe('2026-10-09T08:55:00-06:00');
  });
  it('cambia de día cuando corresponde', () => {
    expect(toAirportLocalIso('2026-10-13T02:00:00.000Z', 'UIO')).toBe('2026-10-12T21:00:00-05:00');
  });
});

describe('toSearchRequest', () => {
  it('ida y vuelta es una sola búsqueda con dos tramos; "youths" va en 0', () => {
    expect(toSearchRequest(PARAMS)).toEqual({
      itineraries: [
        { origin: 'UIO', destination: 'GPS', departureDate: '2026-10-09' },
        { origin: 'GPS', destination: 'UIO', departureDate: '2026-10-12' },
      ],
      passengers: { adults: 2, youths: 0, children: 1, infants: 1 },
    });
  });
  it('solo ida lleva un tramo', () => {
    expect(toSearchRequest({ ...PARAMS, returnDate: undefined }).itineraries).toHaveLength(1);
  });
});

describe('mapSearchResponse con una respuesta real', () => {
  const result = mapSearchResponse(search, PARAMS);
  const offer = result.offers[0];
  const [outbound, inbound] = offer.itineraries;

  it('conserva ids, aerolínea y total de la oferta (dinero en centavos)', () => {
    expect(offer.id).toBe('8f1135a0-2320-42b9-8c1c-91d2614e2228');
    expect(offer.airline).toEqual({ code: 'LA', name: 'LATAM Airlines' });
    expect(offer.grandTotal).toEqual({ cents: 300986, currency: 'USD' });
  });

  it('segmentos con hora local, escala y número de vuelo de la API', () => {
    expect(outbound.stops).toBe(1);
    expect(outbound.segments.map((s) => s.flightNumber)).toEqual(['LA1400', 'LA2410']);
    expect(outbound.segments[0].departureTime).toBe('2026-10-09T06:00:00-05:00');
    expect(outbound.segments[1].departureTime).toBe('2026-10-09T08:00:00-05:00');
    expect(outbound.segments[1].arrivalTime).toBe('2026-10-09T08:55:00-06:00');
    expect(outbound.segments[1].layoverMinutes).toBe(65);
    expect(inbound.segments[0].origin).toBe('GPS');
  });

  it('familias con sus códigos reales, sin inventar nombres', () => {
    expect(outbound.fares.map((f) => `${f.cabin}/${f.brand}`)).toEqual([
      'ECONOMY/BASIC',
      'ECONOMY/CLASSIC',
      'ECONOMY/FLEX',
      'BUSINESS/BUSINESS_FLEX',
    ]);
    expect(faresForCabin(outbound, 'BUSINESS').map((f) => f.brand)).toEqual(['BUSINESS_FLEX']);
  });

  it('total = precio por tipo × pasajeros, sumado en centavos', () => {
    const basic = outbound.fares.find((f) => f.brand === 'BASIC')!;
    // 2 × 420,42 (adulto) + 315,33 (niño) + 42,04 (infante)
    expect(basic.total).toEqual({ cents: 2 * 42042 + 31533 + 4204, currency: 'USD' });
    expect(basic.pricePerAdult).toEqual({ cents: 42042, currency: 'USD' });
    expect(basic.baggage).toEqual({ personalItem: true, carryOn: 0, checked: 0 });
    expect(basic.refundable).toBe(false);
  });
});

describe('mapFare', () => {
  const pricing = search.offers[0].itineraries[0].pricingOptions[0];
  it('si falta el precio de un tipo de pasajero que viaja, la familia no se ofrece', () => {
    const withoutChild = { ...pricing, pricePerPassengerType: pricing.pricePerPassengerType.filter((p) => p.passengerType !== 'CHILD') };
    expect(mapFare(withoutChild, { adults: 1, children: 1, infants: 0 })).toBeNull();
    expect(mapFare(withoutChild, { adults: 1, children: 0, infants: 0 })).not.toBeNull();
  });
});

describe('mapFlightStatus con una respuesta real', () => {
  it('horas locales y nulos tal como llegan', () => {
    const s = mapFlightStatus(status);
    expect(s).toMatchObject({ flightNumber: 'LA1400', carrier: 'LA', status: 'SCHEDULED', aircraft: '320' });
    expect(s.departure).toEqual({ airport: 'UIO', terminal: null, scheduled: '2026-10-09T06:00:00-05:00', estimated: null, actual: null });
    expect(s.arrival.scheduled).toBe('2026-10-09T06:55:00-05:00');
  });
});
