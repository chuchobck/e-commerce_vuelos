import { createTtlCache } from '@/shared/lib/ttlCache';
import type { Offer } from './cheapestOffer';
import { OFFERS } from './popularRoutes';

/**
 * Memoria + sessionStorage, 10 minutos. Guarda la oferta de una ruta y fecha, o `null` si esa fecha no tiene
 * vuelos (también es una respuesta y cuesta una búsqueda: no se repite). Un error nunca se guarda.
 */
export const offersCache = createTtlCache<Offer | null>('quinde.offers', OFFERS.ttlMs);
