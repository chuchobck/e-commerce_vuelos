import { routes } from '@/app/routes';
import { offerSearchParams, type Offer } from '@/features/offers';
import { searchToQuery } from '@/features/search';

/** «Ver vuelo»: los resultados de la misma búsqueda que dio la oferta (ida, 1 adulto, economía, esa fecha). */
export function offerHref(offer: Offer): string {
  return routes.results(searchToQuery(offerSearchParams(offer)));
}
