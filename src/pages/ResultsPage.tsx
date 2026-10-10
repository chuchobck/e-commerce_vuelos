import { Pencil, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { useAuth } from '@/features/auth';
import { saveSelection, type SelectedLeg } from '@/features/checkout';
import {
  inboundFor,
  ItineraryCard,
  LegTabs,
  NoFlights,
  ResultsToolbar,
  sortItems,
  usableGroups,
  type LegTab,
  type NoFlightsReason,
  type OutboundGroup,
  type SortKey,
} from '@/features/results';
import { queryToSearch, searchToQuery } from '@/features/search';
import { cityOf, destinationsFrom, faresForCabin, flightsApi, type Fare, type FlightOffer, type Itinerary, type SearchCabin, type SearchParams } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { fareName, formatLongDate, formatMoney, formatTime } from '@/shared/lib/format';
import { useAsync } from '@/shared/lib/useAsync';
import { Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';

const r = es.results;

function passengersText(p: SearchParams['passengers']) {
  const n = p.adults + p.children + p.infants;
  return n === 1 ? r.passengersOne : fmt(r.passengersMany, { count: n });
}

function selectedText(itinerary: Itinerary, fare: Fare) {
  return fmt(r.selectedOutbound, {
    flight: itinerary.segments.map((s) => s.flightNumber).join(' + '),
    time: formatTime(itinerary.segments[0].departureTime),
    fare: fareName(fare.brand),
  });
}

function chosenText(itinerary: Itinerary, fare: Fare) {
  return fmt(r.chosenSummary, { time: formatTime(itinerary.segments[0].departureTime), fare: fareName(fare.brand), price: formatMoney(fare.pricePerAdult) });
}

/** Ida elegida (en ida y vuelta) y el grupo de ofertas del que salen las vueltas posibles. */
interface OutboundChoice {
  group: OutboundGroup;
  fare: Fare;
}

export function ResultsPage() {
  const [query] = useSearchParams();
  const queryString = query.toString();
  const params = queryToSearch(query);
  const navigate = useNavigate();
  const { status: authStatus } = useAuth();
  const panelId = useId();
  const tabsRef = useRef<HTMLDivElement>(null);

  const data = useAsync(() => (params ? flightsApi.search(params) : Promise.resolve(null)), [queryString]);
  const [outbound, setOutbound] = useState<OutboundChoice | null>(null);
  const [view, setView] = useState<'out' | 'in'>('out');
  const [sort, setSort] = useState<SortKey>('price');
  const [directOnly, setDirectOnly] = useState(false);
  const [status, setStatus] = useState('');

  // Nueva búsqueda = nueva selección.
  useEffect(() => {
    setOutbound(null);
    setView('out');
  }, [queryString]);

  const cabin: SearchCabin = params?.cabin ?? 'ECONOMY';
  const roundTrip = !!params?.returnDate;

  // Solo lo que tiene familias de la cabina pedida (la API devuelve todas las cabinas juntas).
  const result = data.status === 'success' ? data.data : null;
  const groups = useMemo(() => usableGroups(result?.offers ?? [], cabin, roundTrip), [result, cabin, roundTrip]);

  const originCity = params ? cityOf(params.origin) : '';
  const destinationCity = params ? cityOf(params.destination) : '';
  const heading = params ? fmt(r.heading, { origin: originCity, destination: destinationCity }) : r.headingFallback;
  const modifyHref = routes.search(queryString);

  /** Por qué no hay nada que mostrar: no hay vuelos ese día, falta la vuelta o falta la cabina. */
  const emptyReason = useMemo<NoFlightsReason>(() => {
    const offers = result?.offers ?? [];
    if (offers.length === 0) return 'date';
    if (roundTrip && usableGroups(offers, cabin, false).length > 0) return 'return';
    const other: SearchCabin = cabin === 'ECONOMY' ? 'BUSINESS' : 'ECONOMY';
    return usableGroups(offers, other, roundTrip).length > 0 ? 'cabin' : 'date';
  }, [result, cabin, roundTrip]);

  /** Paso 1 listo: se guarda la selección (aún sin hold). Sin sesión se va a Ingresar y se vuelve aquí mismo. */
  const choose = (offerId: string, out: SelectedLeg, back?: SelectedLeg) => {
    if (!params) return;
    saveSelection({ offerId, outbound: out, inbound: back, passengers: params.passengers, searchQuery: queryString });
    navigate(authStatus === 'anonymous' ? routes.login(routes.checkoutDetails()) : routes.checkoutDetails());
  };

  const showTabs = () => requestAnimationFrame(() => tabsRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }));

  const chooseOutbound = (group: OutboundGroup, itinerary: Itinerary, fare: Fare) => {
    if (!roundTrip) {
      choose(group.offers[0].id, { itinerary, fare });
      return;
    }
    setOutbound({ group, fare });
    setView('in');
    setStatus(`${selectedText(itinerary, fare)} ${r.nowChooseInbound}`);
    showTabs();
    requestAnimationFrame(() => document.getElementById('vuelta-title')?.focus());
  };

  /** La vuelta define la oferta final: su ida es la misma elegida, con la misma familia. */
  const chooseInbound = (offer: FlightOffer, itinerary: Itinerary, fare: Fare) => {
    if (!outbound) return;
    const outIt = offer.itineraries[0];
    const outFare = outIt.fares.find((f) => f.cabin === outbound.fare.cabin && f.brand === outbound.fare.brand) ?? outbound.fare;
    choose(offer.id, { itinerary: outIt, fare: outFare }, { itinerary, fare });
  };

  const selectLeg = (id: 'out' | 'in') => {
    setView(id);
    setStatus(id === 'out' ? fmt(r.outboundTitle, { origin: originCity, destination: destinationCity }) : fmt(r.inboundTitle, { origin: destinationCity, destination: originCity }));
    requestAnimationFrame(() => document.getElementById(id === 'out' ? 'ida-title' : 'vuelta-title')?.focus());
  };

  const summary = params
    ? fmt(r.summary, {
        date: formatLongDate(params.departDate) + (params.returnDate ? ` – ${formatLongDate(params.returnDate)}` : ''),
        passengers: passengersText(params.passengers),
        cabin: params.cabin === 'BUSINESS' ? es.search.cabinBusiness : es.search.cabinEconomy,
      })
    : undefined;

  // Lista de la pestaña abierta, ya filtrada y ordenada.
  const outboundItems = useMemo(
    () => sortItems(directOnly ? groups.filter((g) => g.itinerary.stops === 0) : groups, (g) => g.itinerary, sort, cabin),
    [groups, directOnly, sort, cabin],
  );
  const inboundAll = useMemo(
    () => (outbound ? inboundFor(outbound.group).filter((i) => faresForCabin(i.itinerary, cabin).length > 0) : []),
    [outbound, cabin],
  );
  const inboundItems = useMemo(
    () => sortItems(directOnly ? inboundAll.filter((i) => i.itinerary.stops === 0) : inboundAll, (i) => i.itinerary, sort, cabin),
    [inboundAll, directOnly, sort, cabin],
  );
  const inboundView = roundTrip && view === 'in' && !!outbound;
  const visibleCount = inboundView ? inboundItems.length : outboundItems.length;
  const hasStops = (inboundView ? inboundAll.map((i) => i.itinerary) : groups.map((g) => g.itinerary)).some((it) => it.stops > 0);

  const tabs: LegTab[] = params
    ? [
        {
          id: 'out',
          number: 1,
          title: r.legOutbound,
          route: fmt(r.route, { origin: params.origin, destination: params.destination }),
          date: formatLongDate(params.departDate),
          chosen: outbound ? chosenText(outbound.group.itinerary, outbound.fare) : undefined,
        },
        {
          id: 'in',
          number: 2,
          title: r.legInbound,
          route: fmt(r.route, { origin: params.destination, destination: params.origin }),
          date: params.returnDate ? formatLongDate(params.returnDate) : '',
          blocked: outbound ? undefined : r.chooseOutboundFirst,
        },
      ]
    : [];

  const otherCabin: SearchCabin = cabin === 'ECONOMY' ? 'BUSINESS' : 'ECONOMY';
  const otherCabinLabel = otherCabin === 'BUSINESS' ? es.search.cabinBusiness : es.search.cabinEconomy;

  return (
    <Page
      title={r.pageTitle}
      heading={heading}
      lead={summary}
      aside={
        params ? (
          <Button asChild variant="secondary">
            <Link to={modifyHref}>
              <Pencil aria-hidden="true" />
              {r.modify}
            </Link>
          </Button>
        ) : null
      }
    >
      <p role="status" className="sr-only">
        {status}
      </p>

      {!params ? (
        <EmptyState
          title={r.invalidTitle}
          text={r.invalidText}
          icon={<Search className="size-8" />}
          action={
            <Button asChild>
              <Link to={routes.search()}>{es.common.searchFlights}</Link>
            </Button>
          }
        />
      ) : data.status === 'loading' || data.status === 'idle' ? (
        <LoadingState label={r.loading} skeletons={3} />
      ) : data.status === 'error' ? (
        <ErrorState error={data.error} onRetry={() => void data.execute()} />
      ) : groups.length === 0 ? (
        <NoFlights
          params={params}
          reason={emptyReason}
          hrefFor={(variant) => routes.results(searchToQuery(variant.params))}
          otherCabin={emptyReason === 'cabin' ? { label: otherCabinLabel, href: routes.results(searchToQuery({ ...params, cabin: otherCabin })) } : undefined}
          otherDestinations={destinationsFrom(params.origin)
            .filter((code) => code !== params.destination)
            .slice(0, 5)
            .map((code) => ({ code, city: cityOf(code), href: routes.results(searchToQuery({ ...params, destination: code })) }))}
          modifyHref={modifyHref}
        />
      ) : (
        <>
          {roundTrip ? (
            <div ref={tabsRef}>
              <LegTabs tabs={tabs} activeId={view} panelId={panelId} onSelect={selectLeg} />
            </div>
          ) : null}

          <ResultsToolbar
            count={visibleCount}
            sort={sort}
            onSort={setSort}
            directOnly={directOnly}
            onDirectOnly={setDirectOnly}
            canFilterDirect={hasStops || directOnly}
          />

          <div
            id={panelId}
            role={roundTrip ? 'tabpanel' : undefined}
            aria-labelledby={roundTrip ? `${panelId}-tab-${view}` : undefined}
            className="flex flex-col gap-6"
          >
            {inboundView ? (
              <section aria-labelledby="vuelta-title" className="flex flex-col gap-6">
                <h2 id="vuelta-title" tabIndex={-1} className="text-2xl">
                  {fmt(r.inboundTitle, { origin: destinationCity, destination: originCity })}
                </h2>
                {inboundItems.length === 0 ? (
                  <p role="status">{r.noDirect}</p>
                ) : (
                  <ul aria-label={r.inboundList} className="flex flex-col gap-6">
                    {inboundItems.map(({ offer, itinerary }) => (
                      <li key={offer.id}>
                        <ItineraryCard
                          itinerary={itinerary}
                          airlineName={offer.airline.name}
                          cabin={cabin}
                          onChoose={(it, fare) => chooseInbound(offer, it, fare)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : (
              <section aria-labelledby="ida-title" className="flex flex-col gap-6">
                <h2 id="ida-title" tabIndex={-1} className="text-2xl">
                  {fmt(r.outboundTitle, { origin: originCity, destination: destinationCity })}
                </h2>
                {outboundItems.length === 0 ? (
                  <p role="status">{r.noDirect}</p>
                ) : (
                  <ul aria-label={r.outboundList} className="flex flex-col gap-6">
                    {outboundItems.map((group) => (
                      <li key={group.key}>
                        <ItineraryCard
                          itinerary={group.itinerary}
                          airlineName={group.airlineName}
                          cabin={cabin}
                          selectedBrand={outbound?.group.key === group.key ? outbound.fare.brand : undefined}
                          onChoose={(it, fare) => chooseOutbound(group, it, fare)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </Page>
  );
}
