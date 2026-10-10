import { describe, expect, it } from 'vitest';
import { cheapestOffer, originsOf, sortOffers, visibleOffers, type Offer } from './cheapestOffer';
import { fare, flightOffer, offer } from './testSupport';

const ROUTE = { origin: 'UIO', destination: 'GYE' };
const DATE = '2026-10-13';

describe('la oferta más barata de una ruta', () => {
  it('elige la tarifa económica de menor precio entre todos los vuelos', () => {
    const offer = cheapestOffer(ROUTE, DATE, [
      flightOffer(ROUTE, DATE, { flight: 'LA1400', departs: '06:00', fares: [fare(7200), fare(9800, { brand: 'CLASSIC' })] }),
      flightOffer(ROUTE, DATE, { flight: 'AV1500', departs: '07:30', fares: [fare(6100)], airline: { code: 'AV', name: 'Avianca' } }),
      flightOffer(ROUTE, DATE, { flight: 'LA1404', departs: '16:00', fares: [fare(8800)] }),
    ]);
    expect(offer).toMatchObject({
      id: 'UIO-GYE-2026-10-13',
      price: { cents: 6100, currency: 'USD' },
      airline: { code: 'AV', name: 'Avianca' },
      flightNumbers: ['AV1500'],
      departureTime: '2026-10-13T07:30:00-05:00',
      stops: 0,
    });
  });

  it('no mira la cabina Business aunque sea la única barata de un vuelo', () => {
    const offer = cheapestOffer(ROUTE, DATE, [
      flightOffer(ROUTE, DATE, { flight: 'LA1400', departs: '06:00', fares: [fare(4000, { cabin: 'BUSINESS', brand: 'BUSINESS_FLEX' }), fare(7200)] }),
    ]);
    expect(offer?.price.cents).toBe(7200);
  });

  it('toma la moneda de la respuesta, sin suponer dólares', () => {
    const eur = { cents: 5000, currency: 'EUR' };
    const offer = cheapestOffer(ROUTE, DATE, [flightOffer(ROUTE, DATE, { flight: 'LA1400', departs: '06:00', fares: [fare(5000, { pricePerAdult: eur, total: eur })] })]);
    expect(offer?.price).toEqual(eur);
  });

  it('un vuelo con escala trae todos sus números de vuelo, la llegada del último tramo y los asientos de la API', () => {
    const offer = cheapestOffer(ROUTE, DATE, [flightOffer(ROUTE, DATE, { flight: 'AV1500', departs: '07:30', stops: 1, fares: [fare(6100, { seatsLeft: 3 })] })]);
    expect(offer).toMatchObject({ flightNumbers: ['AV1500', 'AV15001'], stops: 1, durationMinutes: 115, seatsLeft: 3 });
  });

  it('a igual precio gana el que sale antes; a igual salida, el de menos escalas', () => {
    const early = flightOffer(ROUTE, DATE, { flight: 'LA1400', departs: '06:00', fares: [fare(5500)] });
    const late = flightOffer(ROUTE, DATE, { flight: 'LA1406', departs: '20:00', fares: [fare(5500)] });
    expect(cheapestOffer(ROUTE, DATE, [late, early])?.flightNumbers).toEqual(['LA1400']);
    const direct = flightOffer(ROUTE, DATE, { flight: 'LA1402', departs: '10:30', fares: [fare(5500)] });
    const stop = flightOffer(ROUTE, DATE, { flight: 'AV1502', departs: '10:30', stops: 1, fares: [fare(5500)] });
    expect(cheapestOffer(ROUTE, DATE, [stop, direct])?.stops).toBe(0);
  });

  it('una ruta sin vuelos, o sin tarifa económica, no tiene oferta (null, no un precio inventado)', () => {
    expect(cheapestOffer(ROUTE, DATE, [])).toBeNull();
    const onlyBusiness = flightOffer(ROUTE, DATE, { flight: 'LA1400', departs: '06:00', fares: [fare(9000, { cabin: 'BUSINESS' })] });
    expect(cheapestOffer(ROUTE, DATE, [onlyBusiness])).toBeNull();
  });
});

const o = (id: string, origin: string, cents: number, departureTime = '2026-10-13T08:00:00-05:00'): Offer =>
  offer({ id, origin, destination: 'XXX', price: { cents, currency: 'USD' }, departureTime, arrivalTime: departureTime });

describe('orden, filtro y tope', () => {
  const list = [o('a', 'UIO', 7000), o('b', 'GYE', 4000), o('c', 'UIO', 5000), o('d', 'GYE', 9000), o('e', 'CUE', 6000), o('f', 'UIO', 8000), o('g', 'LOH', 3000)];

  it('va de menor a mayor precio', () => {
    expect(sortOffers(list).map((x) => x.id)).toEqual(['g', 'b', 'c', 'e', 'a', 'f', 'd']);
  });

  it('a igual precio, la que sale antes; no cambia la lista original', () => {
    const copy = [o('x', 'UIO', 5000, '2026-10-13T15:00:00-05:00'), o('y', 'UIO', 5000, '2026-10-13T06:00:00-05:00')];
    expect(sortOffers(copy).map((x) => x.id)).toEqual(['y', 'x']);
    expect(copy.map((x) => x.id)).toEqual(['x', 'y']);
  });

  it('muestra como máximo 6 tarjetas: las 6 más baratas', () => {
    const shown = visibleOffers(list, null, 6);
    expect(shown).toHaveLength(6);
    expect(shown.map((x) => x.id)).toEqual(['g', 'b', 'c', 'e', 'a', 'f']);
  });

  it('filtra por origen y deja el orden por precio', () => {
    expect(visibleOffers(list, 'UIO', 6).map((x) => x.id)).toEqual(['c', 'a', 'f']);
    expect(visibleOffers(list, 'XYZ', 6)).toEqual([]);
  });

  it('los chips de origen solo ofrecen orígenes con ofertas, en el orden fijo de las rutas populares (no cambian con los precios)', () => {
    expect(originsOf(list)).toEqual(['UIO', 'GYE', 'LOH', 'CUE']);
    expect(originsOf([o('z', 'GYE', 1000), o('y', 'UIO', 9000)])).toEqual(['UIO', 'GYE']);
    expect(originsOf([])).toEqual([]);
  });
});
