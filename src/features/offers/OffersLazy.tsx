import { lazy, Suspense } from 'react';
import { useInView } from '@/shared/lib/useInView';
import { OffersFrame } from './OffersFrame';
import type { OffersSectionProps } from './OffersSection';
import { OffersSkeleton } from './OffersSkeleton';

// La sección (tarjetas, filtros, carga y caché) no pesa en la primera pantalla: se descarga al acercarse.
const OffersSection = lazy(() => import('./OffersSection').then((m) => ({ default: m.OffersSection })));

export interface OffersProps extends OffersSectionProps {
  /** Carga sin esperar a que se vea (la página /ofertas, donde son el contenido principal). */
  eager?: boolean;
}

function Placeholder({ heading }: { heading: boolean }) {
  return (
    <OffersFrame heading={heading}>
      <OffersSkeleton />
    </OffersFrame>
  );
}

/**
 * Ofertas con carga diferida: no se descarga el código ni se pide ninguna búsqueda a la API hasta que la sección está a punto
 * de verse (o `eager`). Mientras tanto reserva el mismo espacio, así la página no salta.
 */
export function Offers({ eager = false, ...props }: OffersProps) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const heading = props.heading ?? true;
  return (
    <div ref={ref}>
      {eager || inView ? (
        <Suspense fallback={<Placeholder heading={heading} />}>
          <OffersSection {...props} />
        </Suspense>
      ) : (
        <Placeholder heading={heading} />
      )}
    </div>
  );
}
