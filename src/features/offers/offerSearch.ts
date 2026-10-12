import type { SearchParams } from '@/shared/api';
import type { Offer } from './cheapestOffer';

/**
 * La búsqueda que dio origen a una oferta (ida, 1 adulto, economía, esa fecha). Quien enlaza a los resultados la convierte
 * en URL con `searchToQuery` de la búsqueda: así «Ver vuelo» abre exactamente lo que se consultó, sin duplicar esa lógica.
 */
export function offerSearchParams(offer: Offer): SearchParams {
  return {
    origin: offer.origin,
    destination: offer.destination,
    departDate: offer.date,
    passengers: { adults: 1, children: 0, infants: 0 },
    cabin: 'ECONOMY',
  };
}
