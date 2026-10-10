import { Offers } from '@/features/offers';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { es } from '@/shared/i18n';
import { offerHref } from './offerHref';

const o = es.offers;

/** Todas las ofertas en una página: las mismas búsquedas y la misma caché que la sección del inicio. */
export function OffersPage() {
  return (
    <Page title={o.pageTitle} heading={o.heading} lead={o.pageLead}>
      <p className="max-w-prose text-muted">{o.what}</p>
      <Offers eager heading={false} hrefFor={offerHref} searchHref={routes.search()} />
    </Page>
  );
}
