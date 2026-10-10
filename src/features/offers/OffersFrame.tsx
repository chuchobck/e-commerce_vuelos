import type { ReactNode } from 'react';
import { es } from '@/shared/i18n';

/**
 * Marco de la sección de ofertas. Con `heading` (el inicio) lleva su título y su texto desde el primer momento (también en el
 * marcador que espera a verse), así el contenido no salta cuando llegan las tarjetas. Sin `heading` (la página /ofertas, cuyo h1
 * ya es el título) es solo la región de ofertas, sin otro contenedor.
 */
export function OffersFrame({ heading = true, children }: { heading?: boolean; children: ReactNode }) {
  if (!heading) {
    return (
      <section aria-label={es.offers.listLabel} className="flex flex-col gap-8">
        {children}
      </section>
    );
  }
  return (
    <section aria-labelledby="ofertas-title" className="bg-surface">
      <div className="container-page flex flex-col gap-8 py-16">
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 id="ofertas-title" className="text-3xl md:text-4xl">
            {es.offers.title}
          </h2>
          <p className="text-lg text-muted">{es.offers.lead}</p>
        </div>
        {children}
      </div>
    </section>
  );
}
