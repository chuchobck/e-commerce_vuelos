import { Hourglass, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cityOf } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { useAfterDelay } from '@/shared/lib/useAfterDelay';
import { Alert, Button, EmptyState, LoadingState, RetryButton } from '@/shared/ui';
import { originsOf, visibleOffers, type Offer } from './cheapestOffer';
import { OfferCard } from './OfferCard';
import { OfferFilters } from './OfferFilters';
import { OffersMockHints } from './OffersMockHints';
import { OffersFrame } from './OffersFrame';
import { OffersSkeleton } from './OffersSkeleton';
import { OFFERS } from './popularRoutes';
import { useOffers } from './useOffers';

const t = es.offers;

/** Pasado este tiempo cargando se avisa que el servidor puede estar despertando (arranque en frío de Render). */
const WAKING_AFTER_MS = 8000;
/** Si la API no dijo cuánto esperar tras un 429, se espera esto antes de dejar reintentar. */
const DEFAULT_WAIT_S = 10;

export interface OffersSectionProps {
  /** Dónde lleva «Ver vuelo»: la URL de resultados de esa oferta (la arma la página; esta sección no conoce el buscador). */
  hrefFor: (offer: Offer) => string;
  /** Dónde lleva «Buscar vuelos» cuando no hay ofertas. */
  searchHref: string;
  /** Con título propio (inicio) o sin él (la página /ofertas ya tiene su h1). */
  heading?: boolean;
}

/**
 * Ofertas del inicio: la tarifa económica más baja de las rutas populares, tomada de búsquedas reales (ver `loadOffers`).
 * Carga al montarse; `Offers` (OffersLazy) se encarga de montarla solo cuando la sección se ve.
 */
export function OffersSection({ hrefFor, searchHref, heading = true }: OffersSectionProps) {
  const { state, reload } = useOffers(true);
  const [origin, setOrigin] = useState<string | null>(null);
  const loading = state.status === 'loading';
  const waking = useAfterDelay(loading, WAKING_AFTER_MS);

  const report = state.status === 'done' ? state.report : null;
  const offers = report?.offers ?? [];
  const origins = originsOf(offers);
  const active = origin && origins.includes(origin) ? origin : null;
  const shown = visibleOffers(offers, active, OFFERS.limit);

  // Lo que se anuncia a un lector de pantalla cuando llegan las ofertas o se cambia el filtro.
  const announcement = !report || offers.length === 0 ? '' : active ? fmt(shown.length === 1 ? t.filteredOne : t.filtered, { count: shown.length, city: cityOf(active) }) : fmt(offers.length === 1 ? t.loadedOne : t.loaded, { count: offers.length });

  const searchLink = (
    <Button asChild variant="secondary">
      <Link to={searchHref}>
        <Search aria-hidden="true" />
        {es.common.searchFlights}
      </Link>
    </Button>
  );
  const retryWait = report?.rateLimited ? (report.rateLimited.retryAfterSeconds ?? DEFAULT_WAIT_S) : 0;
  const problem = report !== null && (report.failed.length > 0 || report.rateLimited !== null);

  return (
    <OffersFrame heading={heading}>
      {origins.length > 1 ? <OfferFilters origins={origins} value={active} onChange={setOrigin} /> : null}

      {/* Las regiones en vivo existen siempre, para que el lector anuncie lo que aparece después. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div aria-live="polite" aria-atomic="true">
        {waking ? (
          <p className="flex items-center justify-center gap-2 text-center font-bold">
            <Hourglass aria-hidden="true" className="size-5 shrink-0 text-primary motion-safe:animate-pulse" />
            {t.waking}
          </p>
        ) : null}
      </div>

      {loading ? (
        <>
          <LoadingState label={t.loading} className="items-center" />
          <OffersSkeleton />
        </>
      ) : null}

      {report && offers.length === 0 ? (
        report.rateLimited ? (
          <Alert
            variant="warning"
            live="polite"
            title={t.rateLimitedTitle}
            action={
              <div className="flex flex-wrap items-start gap-4">
                <RetryButton onRetry={reload} waitSeconds={retryWait} label={t.retry} />
                {searchLink}
              </div>
            }
          >
            {t.rateLimitedText}
          </Alert>
        ) : report.failed.length > 0 ? (
          <Alert
            variant="info"
            live="polite"
            title={t.errorTitle}
            action={
              <div className="flex flex-wrap items-start gap-4">
                <RetryButton onRetry={reload} waitSeconds={0} label={t.retry} />
                {searchLink}
              </div>
            }
          >
            {t.errorText}
          </Alert>
        ) : (
          <EmptyState title={t.emptyTitle} text={t.emptyText} headingLevel={heading ? 'h3' : 'h2'} action={searchLink} />
        )
      ) : null}

      {shown.length > 0 ? (
        <ul aria-label={t.listLabel} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((offer) => (
            <li key={offer.id}>
              <OfferCard offer={offer} href={hrefFor(offer)} headingLevel={heading ? 'h3' : 'h2'} />
            </li>
          ))}
        </ul>
      ) : null}

      {shown.length > 0 ? <p className="mx-auto text-center text-sm text-muted">{t.footnote}</p> : null}

      {problem && offers.length > 0 ? (
        <Alert variant="info" live="polite" title={t.partialText} action={<RetryButton onRetry={reload} waitSeconds={retryWait} label={t.retry} />} />
      ) : null}

      <OffersMockHints />
    </OffersFrame>
  );
}
