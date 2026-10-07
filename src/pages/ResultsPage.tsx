import { Pencil, PlaneTakeoff, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { saveSelection, type SelectedLeg } from '@/features/checkout';
import { groupOutbound, inboundFor, ItineraryCard, type OutboundGroup } from '@/features/results';
import { queryToSearch } from '@/features/search';
import { cityOf, faresForCabin, flightsApi, type Fare, type FlightOffer, type Itinerary, type SearchParams } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { lastFlightDate, toDisplayDate } from '@/shared/lib/dates';
import { fareName, formatLongDate, formatTime } from '@/shared/lib/format';
import { useAsync } from '@/shared/lib/useAsync';
import { Alert, Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';

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

  const data = useAsync(() => (params ? flightsApi.search(params) : Promise.resolve(null)), [queryString]);
  const [outbound, setOutbound] = useState<OutboundChoice | null>(null);
  const [status, setStatus] = useState('');

  // Nueva búsqueda = nueva selección.
  useEffect(() => setOutbound(null), [queryString]);

  const cabin = params?.cabin ?? 'ECONOMY';
  const roundTrip = !!params?.returnDate;

  // Solo lo que tiene familias de la cabina pedida (la API devuelve todas las cabinas juntas).
  const result = data.status === 'success' ? data.data : null;
  const groups = useMemo(
    () =>
      groupOutbound(result?.offers ?? []).filter(
        (g) =>
          faresForCabin(g.itinerary, cabin).length > 0 &&
          (!roundTrip || inboundFor(g).some((i) => faresForCabin(i.itinerary, cabin).length > 0)),
      ),
    [result, cabin, roundTrip],
  );

  const originCity = params ? cityOf(params.origin) : '';
  const destinationCity = params ? cityOf(params.destination) : '';
  const heading = params ? fmt(r.heading, { origin: originCity, destination: destinationCity }) : r.headingFallback;
  const modifyHref = routes.search(queryString);

  /** Paso 1 listo: se guarda la selección (aún sin hold) y se pasa al paso 2. */
  const choose = (offerId: string, out: SelectedLeg, back?: SelectedLeg) => {
    if (!params) return;
    saveSelection({ offerId, outbound: out, inbound: back, passengers: params.passengers, searchQuery: queryString });
    navigate(routes.checkoutDetails());
  };

  const chooseOutbound = (group: OutboundGroup, itinerary: Itinerary, fare: Fare) => {
    if (!roundTrip) {
      choose(group.offers[0].id, { itinerary, fare });
      return;
    }
    setOutbound({ group, fare });
    setStatus(`${selectedText(itinerary, fare)} ${r.nowChooseInbound}`);
    requestAnimationFrame(() => document.getElementById('vuelta-title')?.focus());
  };

  /** La vuelta define la oferta final: su ida es la misma elegida, con la misma familia. */
  const chooseInbound = (offer: FlightOffer, itinerary: Itinerary, fare: Fare) => {
    if (!outbound) return;
    const outIt = offer.itineraries[0];
    const outFare = outIt.fares.find((f) => f.cabin === outbound.fare.cabin && f.brand === outbound.fare.brand) ?? outbound.fare;
    choose(offer.id, { itinerary: outIt, fare: outFare }, { itinerary, fare });
  };

  const summary = params
    ? fmt(r.summary, {
        date: formatLongDate(params.departDate) + (params.returnDate ? ` – ${formatLongDate(params.returnDate)}` : ''),
        passengers: passengersText(params.passengers),
        cabin: params.cabin === 'BUSINESS' ? es.search.cabinBusiness : es.search.cabinEconomy,
      })
    : undefined;

  const modifyButton = (
    <Button asChild>
      <Link to={modifyHref}>{r.modify}</Link>
    </Button>
  );

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
        <EmptyState
          title={r.emptyTitle}
          text={fmt(r.emptyText, { date: toDisplayDate(lastFlightDate()) })}
          icon={<PlaneTakeoff className="size-8" />}
          action={modifyButton}
        />
      ) : (
        <>
          <p role="status" className="font-bold">
            {groups.length === 1 ? r.foundOne : fmt(r.found, { count: groups.length })}
          </p>

          <section aria-labelledby="ida-title" className="flex flex-col gap-6">
            <h2 id="ida-title" className="text-2xl">
              {fmt(r.outboundTitle, { origin: originCity, destination: destinationCity })}
            </h2>
            <ul aria-label={r.outboundList} className="flex flex-col gap-6">
              {groups.map((group) => (
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
          </section>

          {roundTrip ? (
            <section aria-labelledby="vuelta-title" className="flex flex-col gap-6">
              <h2 id="vuelta-title" tabIndex={-1} className="text-2xl">
                {fmt(r.inboundTitle, { origin: destinationCity, destination: originCity })}
              </h2>
              {outbound ? (
                <>
                  <Alert variant="success" title={r.nowChooseInbound}>
                    <p>{selectedText(outbound.group.itinerary, outbound.fare)}</p>
                  </Alert>
                  <ul aria-label={r.inboundList} className="flex flex-col gap-6">
                    {inboundFor(outbound.group)
                      .filter((i) => faresForCabin(i.itinerary, cabin).length > 0)
                      .map(({ offer, itinerary }) => (
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
                </>
              ) : (
                <Alert variant="info">
                  <p>{r.chooseOutboundFirst}</p>
                </Alert>
              )}
            </section>
          ) : null}
        </>
      )}
    </Page>
  );
}
