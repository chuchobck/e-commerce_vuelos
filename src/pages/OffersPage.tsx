import { Search, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { es } from '@/shared/i18n';
import { Button, EmptyState } from '@/shared/ui';

const o = es.offers;

/** Ofertas por destino: se construye en F7. Mientras tanto, lleva al buscador. */
export function OffersPage() {
  return (
    <Page title={o.pageTitle} heading={o.heading} width="narrow">
      <EmptyState
        title={o.soonTitle}
        text={o.soonText}
        icon={<Tag className="size-8" />}
        action={
          <Button asChild>
            <Link to={routes.search()}>
              <Search aria-hidden="true" />
              {es.common.searchFlights}
            </Link>
          </Button>
        }
      />
    </Page>
  );
}
