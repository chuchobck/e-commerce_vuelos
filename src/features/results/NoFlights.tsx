import { format } from 'date-fns';
import { CalendarSearch, PlaneTakeoff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { flightsApi, type SearchParams } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { dateLocale, parseIsoDate, toDisplayDate, lastFlightDate } from '@/shared/lib/dates';
import { formatMoney } from '@/shared/lib/format';
import { Button, LoadingState, Skeleton } from '@/shared/ui';
import { findNearby, type DateVariant, type NearbyKind, type NearbyResult } from './nearbyDates';

const r = es.results;

/** Resultados ya calculados por búsqueda: volver o refrescar no repite las consultas (límite de 20 por minuto). */
const memo = new Map<string, NearbyResult[]>();

const day = (iso: string | undefined) => {
  const date = parseIsoDate(iso);
  return date ? format(date, "EEEE d 'de' MMMM", { locale: dateLocale }) : (iso ?? '');
};

/** Vacía lo memorizado (pruebas). */
export function clearNearbyMemo(): void {
  memo.clear();
}

export type NoFlightsReason = 'date' | 'return' | 'cabin';

interface NoFlightsProps {
  params: SearchParams;
  reason: NoFlightsReason;
  /** Enlace a los resultados con otras fechas. */
  hrefFor: (variant: DateVariant) => string;
  /** Si en la otra cabina sí hay vuelos: lleva a buscar en ella. */
  otherCabin?: { label: string; href: string };
  /** Otros destinos desde el mismo origen (enlaces al buscador). */
  otherDestinations: { code: string; city: string; href: string }[];
  modifyHref: string;
}

/**
 * "No hay vuelos" nunca termina ahí: explica qué falta (fecha, regreso o cabina), ofrece fechas cercanas
 * con su precio ya consultado, la otra cabina si aplica, otros destinos y volver a modificar la búsqueda.
 */
export function NoFlights({ params, reason, hrefFor, otherCabin, otherDestinations, modifyHref }: NoFlightsProps) {
  const kind: NearbyKind = reason === 'return' ? 'return' : 'both';
  const key = `${kind}|${JSON.stringify(params)}`;
  const [items, setItems] = useState<NearbyResult[] | null>(memo.get(key) ?? null);

  useEffect(() => {
    if (reason === 'cabin') return;
    const cached = memo.get(key);
    if (cached) return setItems(cached);
    setItems(null);
    let cancelled = false;
    void findNearby(params, kind, { search: (p) => flightsApi.search(p), isCancelled: () => cancelled }).then((found) => {
      if (cancelled) return;
      memo.set(key, found);
      setItems(found);
    });
    return () => {
      cancelled = true;
    };
  }, [key, kind, params, reason]);

  const title =
    reason === 'return'
      ? fmt(r.emptyReturnTitle, { date: day(params.returnDate) })
      : reason === 'cabin'
        ? fmt(r.emptyCabinTitle, { cabin: params.cabin === 'BUSINESS' ? es.search.cabinBusiness : es.search.cabinEconomy })
        : fmt(r.emptyDateTitle, { date: day(params.departDate) });
  const text = reason === 'cabin' ? r.emptyCabinText : reason === 'return' ? r.emptyReturnText : r.emptyDateText;

  return (
    <section aria-labelledby="no-flights-title" className="flex flex-col gap-8">
      <div role="status" className="flex flex-col items-center gap-4 rounded border-2 border-dashed border-input bg-surface px-6 py-8 text-center">
        <span aria-hidden="true" className="flex size-16 items-center justify-center rounded-full bg-primary-tint text-primary">
          <PlaneTakeoff className="size-8" />
        </span>
        <h2 id="no-flights-title" className="text-xl">
          {title}
        </h2>
        <p className="text-muted">{text}</p>
      </div>

      {reason !== 'cabin' ? (
        <section aria-labelledby="nearby-title" className="flex flex-col gap-4">
          <h3 id="nearby-title" className="flex items-center gap-2 text-xl">
            <CalendarSearch aria-hidden="true" className="size-6 text-primary" />
            {r.nearbyTitle}
          </h3>
          {items === null ? (
            <>
              <LoadingState label={r.nearbyLoading} />
              <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            </>
          ) : items.length === 0 ? (
            <p>{fmt(r.nearbyNone, { date: toDisplayDate(lastFlightDate()) })}</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {items.map(({ variant, from }) => {
                const shown = variant.kind === 'return' ? variant.params.returnDate : variant.params.departDate;
                const back = variant.kind === 'both' ? variant.params.returnDate : undefined;
                return (
                  <li key={variant.id}>
                    <Link
                      to={hrefFor(variant)}
                      aria-label={fmt(r.nearbyLink, { date: day(shown), price: formatMoney(from) })}
                      className="flex h-full min-h-14 flex-col gap-2 rounded border-2 border-border bg-surface p-4 text-foreground no-underline shadow-card hover:border-primary hover:bg-primary-tint"
                    >
                      <span className="text-sm text-muted">{variant.kind === 'return' ? r.nearbyReturnLabel : r.nearbyDepartLabel}</span>
                      <span className="block text-lg font-bold first-letter:uppercase">{day(shown)}</span>
                      {back ? <span className="text-sm text-muted">{fmt(r.nearbyBack, { date: day(back) })}</span> : null}
                      <span className="mt-auto text-base">
                        {r.nearbyFrom} <strong className="tabular-nums">{formatMoney(from)}</strong>
                        <span className="text-sm text-muted"> {es.common.perPerson}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {otherCabin ? (
        <div className="flex flex-col items-start gap-2">
          <p>{fmt(r.otherCabinText, { cabin: otherCabin.label })}</p>
          <Button asChild variant="secondary">
            <Link to={otherCabin.href}>{fmt(r.otherCabinAction, { cabin: otherCabin.label })}</Link>
          </Button>
        </div>
      ) : null}

      {otherDestinations.length > 0 ? (
        <section aria-labelledby="other-destinations-title" className="flex flex-col gap-4">
          <h3 id="other-destinations-title" className="text-xl">
            {r.otherDestinationsTitle}
          </h3>
          <ul className="flex flex-wrap gap-4">
            {otherDestinations.map((d) => (
              <li key={d.code}>
                <Link to={d.href} className="flex min-h-12 items-center rounded-full border-2 border-input bg-surface px-6 font-bold no-underline hover:bg-primary-tint">
                  {d.city}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div>
        <Button asChild>
          <Link to={modifyHref}>{r.modify}</Link>
        </Button>
      </div>
    </section>
  );
}
