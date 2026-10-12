import { describe, expect, it } from 'vitest';
import { paths } from '@/app/routes';
import { offerSearchParams, type Offer } from '@/features/offers';
import { queryToSearch } from '@/features/search';
import { offerHref } from './offerHref';

const OFFER: Offer = {
  id: 'GYE-GPS-2026-10-13',
  origin: 'GYE',
  destination: 'GPS',
  date: '2026-10-13',
  price: { cents: 19000, currency: 'USD' },
  airline: { code: 'LA', name: 'LATAM' },
  flightNumbers: ['LA2410'],
  departureTime: '2026-10-13T08:00:00-05:00',
  arrivalTime: '2026-10-13T09:55:00-06:00',
  durationMinutes: 115,
  stops: 0,
  seatsLeft: 20,
};

describe('«Ver vuelo» de una oferta', () => {
  it('lleva a /resultados con la misma búsqueda que la dio (ida, 1 adulto, economía, esa fecha)', () => {
    const href = offerHref(OFFER);
    expect(href).toBe(`${paths.results}?origen=GYE&destino=GPS&ida=2026-10-13&adultos=1&ninos=0&infantes=0&cabina=ECONOMY`);
  });

  it('la página de resultados entiende esa URL y recupera exactamente los parámetros de la oferta', () => {
    const [, query] = offerHref(OFFER).split('?');
    expect(queryToSearch(new URLSearchParams(query))).toEqual(offerSearchParams(OFFER));
  });
});
