import { OFFERS } from './popularRoutes';
import { Skeleton } from '@/shared/ui';

/** Marcadores de las tarjetas (decorativos: el estado se anuncia con el texto de carga, no con ellos). */
export function OffersSkeleton() {
  return (
    <ul aria-hidden="true" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: OFFERS.limit }, (_, i) => (
        <li key={i}>
          <Skeleton className="h-80 w-full" />
        </li>
      ))}
    </ul>
  );
}
