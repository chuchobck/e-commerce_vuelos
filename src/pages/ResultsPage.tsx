import { Pencil, PlaneTakeoff, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { saveSelection, type SelectedLeg } from '@/features/checkout';
import { cityOf, OfferCard } from '@/features/results';
import { queryToSearch } from '@/features/search';
import { flightsApi, type Fare, type FlightOffer, type SearchParams } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatLongDate, formatTime } from '@/shared/lib/format';
import { useAsync } from '@/shared/lib/useAsync';
import { Alert, Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';

const r = es.results;

function passengersText(p: SearchParams['passengers']) {
  const n = p.adults + p.children + p.infants;
  return n === 1 ? r.passengersOne : fmt(r.passengersMany, { count: n });
}

export function ResultsPage() {
  const [query] = useSearchParams();
  const queryString = query.toString();
  const params = queryToSearch(query);
  const navigate = useNavigate();

  const data = useAsync(
    async () => {
      if (!params) return null;
      const [result, airports] = await Promise.all([flightsApi.search(params), flightsApi.listAirports()]);
      return { result, airports };
    },
    [queryString],
  );

  const [outbound, setOutbound] = useState<SelectedLeg | null>(null);
  const [status, setStatus] = useState('');

  // Nueva búsqueda = nueva selección.
  useEffect(() => setOutbound(null), [queryString]);

  const airports = data.data?.airports;
  const result = data.data?.result;
  const originCity = params ? cityOf(airports, params.origin) : '';
  const destinationCity = params ? cityOf(airports, params.destination) : '';
  const heading = params ? fmt(r.heading, { origin: originCity, destination: destinationCity }) : r.headingFallback;
  const modifyHref = routes.search(queryString);

  /** Paso 1 listo: se guarda la selección (aún sin hold) y se pasa al paso 2. */
  const choose = (out: SelectedLeg, back?: SelectedLeg) => {
    if (!params) return;
    saveSelection({ outbound: out, inbound: back, passengers: params.passengers, searchQuery: queryString });
    navigate(routes.checkoutDetails());
  };

  const chooseOutbound = (offer: FlightOffer, fare: Fare) => {
    if (result && result.inbound.length > 0) {
      setOutbound({ offer, fare });
      setStatus(
        `${fmt(r.selectedOutbound, {
          flight: offer.segments.map((s) => s.flightNumber).join(' + '),
          time: formatTime(offer.segments[0].departureTime),
          fare: es.fares[fare.family],
        })} ${r.nowChooseInbound}`,
      );
      requestAnimationFrame(() => document.getElementById('vuelta-title')?.focus());
      return;
    }
    choose({ offer, fare });
  };

  const summary = params
    ? fmt(r.summary, {
        date: formatLongDate(params.departDate) + (params.returnDate ? ` – ${formatLongDate(params.returnDate)}` : ''),
        passengers: passengersText(params.passengers),
        cabin: params.cabin === 'BUSINESS' ? es.search.cabinBusiness : es.search.cabinEconomy,
      })
    : undefined;

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
      ) : result && result.outbound.length === 0 ? (
        <EmptyState
          title={r.emptyTitle}
          text={r.emptyText}
          icon={<PlaneTakeoff className="size-8" />}
          action={
            <Button asChild>
              <Link to={modifyHref}>{r.modify}</Link>
            </Button>
          }
        />
      ) : result ? (
        <>
          <p role="status" className="font-bold">
            {result.outbound.length === 1 ? r.foundOne : fmt(r.found, { count: result.outbound.length })}
          </p>

          <section aria-labelledby="ida-title" className="flex flex-col gap-6">
            <h2 id="ida-title" className="text-2xl">
              {fmt(r.outboundTitle, { origin: originCity, destination: destinationCity })}
            </h2>
            <ul aria-label={r.outboundList} className="flex flex-col gap-6">
              {result.outbound.map((offer) => (
                <li key={offer.id}>
                  <OfferCard
                    offer={offer}
                    airports={airports}
                    selectedFareId={outbound?.offer.id === offer.id ? outbound.fare.id : undefined}
                    onChoose={chooseOutbound}
                  />
                </li>
              ))}
            </ul>
          </section>

          {result.inbound.length > 0 ? (
            <section aria-labelledby="vuelta-title" className="flex flex-col gap-6">
              <h2 id="vuelta-title" tabIndex={-1} className="text-2xl">
                {fmt(r.inboundTitle, { origin: destinationCity, destination: originCity })}
              </h2>
              {outbound ? (
                <>
                  <Alert variant="success" title={r.nowChooseInbound}>
                    <p>
                      {fmt(r.selectedOutbound, {
                        flight: outbound.offer.segments.map((s) => s.flightNumber).join(' + '),
                        time: formatTime(outbound.offer.segments[0].departureTime),
                        fare: es.fares[outbound.fare.family],
                      })}
                    </p>
                  </Alert>
                  <ul aria-label={r.inboundList} className="flex flex-col gap-6">
                    {result.inbound.map((offer) => (
                      <li key={offer.id}>
                        <OfferCard
                          offer={offer}
                          airports={airports}
                          onChoose={(o, f) => choose(outbound, { offer: o, fare: f })}
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
      ) : null}
    </Page>
  );
}
