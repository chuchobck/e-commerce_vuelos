/**
 * Ofertas por destino (F7): la tarifa económica más baja de las rutas populares, de búsquedas reales.
 * Solo lo que se exporte aquí es público. `OffersSection` no se exporta: se carga con `lazy` desde `Offers`.
 */
export { Offers, type OffersProps } from './OffersLazy';
export { offerSearchParams } from './offerSearch';
export type { Offer } from './cheapestOffer';
