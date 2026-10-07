import { addDays, format } from 'date-fns';
import { useMemo, useState } from 'react';
import { Page } from '@/app/layout/Page';
import { SeatSelector, seatSegmentsFromLegs, toAssignedSeats, type SeatAssignments, type SeatPassenger } from '@/features/seats';
import { clearSeatSimulation, flightsApi, seatConflictError, simulateSeatTaken, type CabinClass, type SearchParams } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { useAsync } from '@/shared/lib/useAsync';
import { Alert, Button, ErrorState, LoadingState, RadioGroup } from '@/shared/ui';

const t = es.seats.demo;

interface Scenario {
  id: string;
  label: string;
  search: Pick<SearchParams, 'origin' | 'destination'> & { roundTrip?: boolean };
  adults: number;
  children: number;
  infants: number;
}

const SCENARIOS: Scenario[] = [
  { id: 'single', label: t.scenarioSingle, search: { origin: 'UIO', destination: 'GYE' }, adults: 1, children: 0, infants: 0 },
  { id: 'family', label: t.scenarioFamily, search: { origin: 'UIO', destination: 'GYE', roundTrip: true }, adults: 2, children: 1, infants: 1 },
  { id: 'stop', label: t.scenarioStop, search: { origin: 'CUE', destination: 'GPS' }, adults: 1, children: 0, infants: 0 },
  { id: 'atr', label: t.scenarioAtr, search: { origin: 'UIO', destination: 'OCC' }, adults: 1, children: 0, infants: 0 },
];

function passengersOf(scenario: Scenario): SeatPassenger[] {
  const types = [
    ...Array<SeatPassenger['type']>(scenario.adults).fill('ADULT'),
    ...Array<SeatPassenger['type']>(scenario.children).fill('CHILD'),
    ...Array<SeatPassenger['type']>(scenario.infants).fill('INFANT'),
  ];
  return types.map((type, index) => ({ id: `p${index + 1}`, name: t.names[index], type }));
}

/** Página de demostración (solo en desarrollo) del selector de asientos con el mock. */
export function SeatsDemoPage() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [cabin, setCabin] = useState<CabinClass>('ECONOMY');
  const [value, setValue] = useState<SeatAssignments>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const passengers = useMemo(() => passengersOf(scenario), [scenario]);

  const offer = useAsync(async () => {
    const { origin, destination, roundTrip } = scenario.search;
    const result = await flightsApi.search({
      origin,
      destination,
      departDate: format(addDays(new Date(), 7), 'yyyy-MM-dd'),
      returnDate: roundTrip ? format(addDays(new Date(), 10), 'yyyy-MM-dd') : undefined,
      passengers: { adults: scenario.adults, children: scenario.children, infants: scenario.infants },
      cabin: 'ECONOMY',
    });
    return result.offers[0];
  }, [scenario]);

  const legs = useMemo(() => {
    if (!offer.data) return undefined;
    const pick = (index: number) => {
      const itinerary = offer.data!.itineraries[index];
      const fare = itinerary?.fares.find((f) => f.cabin === cabin);
      return itinerary && fare ? { itinerary, fare } : undefined;
    };
    const outbound = pick(0);
    const inbound = offer.data.itineraries.length > 1 ? pick(1) : undefined;
    return outbound ? { outbound, inbound } : undefined;
  }, [offer.data, cabin]);
  const segments = useMemo(() => (legs ? seatSegmentsFromLegs(legs.outbound, legs.inbound) : []), [legs]);

  const reset = () => {
    clearSeatSimulation();
    setValue({});
    setServerError(null);
    setMessage('');
  };

  const simulateTaken = () => {
    const first = Object.values(value).flatMap((bySegment) => Object.entries(bySegment))[0];
    if (!first) return setMessage(t.simulateTakenNone);
    setMessage('');
    simulateSeatTaken(first[0], first[1]);
    setServerError(seatConflictError('SEAT_TAKEN'));
  };

  const simulateCabin = () => {
    const segment = segments[0];
    if (!segment) return;
    setMessage('');
    // Un asiento de la otra cabina (el avión de dos cabinas tiene 1A en ejecutiva y 10A en económica).
    const wrong = segment.cabin === 'ECONOMY' ? '1A' : '10A';
    setValue((current) => ({ ...current, [passengers[0].id]: { ...current[passengers[0].id], [segment.id]: wrong } }));
    setServerError(seatConflictError('SEAT_CABIN_MISMATCH'));
  };

  const assigned = passengers.map((p) => ({ passengerId: p.id, assignedSeats: toAssignedSeats(value, p.id, segments) }));
  const hasSeats = assigned.some((p) => p.assignedSeats.length > 0);

  return (
    <Page title={t.title} lead={t.lead}>
      <div className="flex flex-wrap gap-8">
        <RadioGroup
          legend={t.scenario}
          appearance="list"
          orientation="vertical"
          value={scenarioId}
          onValueChange={(id) => {
            reset();
            setScenarioId(id);
          }}
          options={SCENARIOS.map((s) => ({ value: s.id, label: s.label }))}
        />
        <RadioGroup
          legend={t.cabin}
          appearance="list"
          orientation="vertical"
          value={cabin}
          onValueChange={(next) => {
            reset();
            setCabin(next as CabinClass);
          }}
          options={[
            { value: 'ECONOMY', label: t.cabinEconomy },
            { value: 'BUSINESS', label: t.cabinBusiness },
          ]}
        />
      </div>

      {offer.status === 'loading' ? <LoadingState label={t.loading} /> : null}
      {offer.status === 'error' ? <ErrorState error={offer.error} onRetry={() => void offer.execute()} /> : null}
      {offer.status === 'success' && !offer.data ? <Alert variant="warning" title={t.noOffer} /> : null}
      {offer.status === 'success' && offer.data && !legs ? <Alert variant="warning" title={t.noFare} /> : null}

      {offer.data && legs ? (
        <>
          <SeatSelector
            key={`${offer.data.id}-${cabin}`}
            offerId={offer.data.id}
            segments={segments}
            passengers={passengers}
            value={value}
            onChange={setValue}
            serverError={serverError}
          />

          <section aria-labelledby="demo-simulate" className="flex flex-col gap-4">
            <h2 id="demo-simulate" className="text-xl">
              {t.simulate}
            </h2>
            <div className="flex flex-wrap gap-4">
              <Button variant="secondary" onClick={simulateTaken} aria-describedby="demo-simulate-hint">
                {t.simulateTaken}
              </Button>
              <Button variant="secondary" onClick={simulateCabin} aria-describedby="demo-simulate-hint">
                {t.simulateCabin}
              </Button>
            </div>
            <p id="demo-simulate-hint" className="text-sm text-muted">
              {t.simulateHint} {t.simulateCabinHint}
            </p>
            {message ? (
              <p role="status" className="font-bold">
                {message}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="demo-output" className="flex flex-col gap-4">
            <h2 id="demo-output" className="text-xl">
              {t.outputTitle}
            </h2>
            <p className="text-sm text-muted">{fmt(t.offer, { offer: offer.data.id })}</p>
            <h3 className="text-lg">{t.outputAssignments}</h3>
            <pre tabIndex={0} role="region" aria-label={t.outputAssignments} className="overflow-auto rounded border-2 border-border bg-surface p-4 text-sm">
              {JSON.stringify(value, null, 2)}
            </pre>
            <h3 className="text-lg">{t.outputMapped}</h3>
            {hasSeats ? (
              <pre tabIndex={0} role="region" aria-label={t.outputMapped} className="overflow-auto rounded border-2 border-border bg-surface p-4 text-sm">
                {JSON.stringify(assigned, null, 2)}
              </pre>
            ) : (
              <p className="text-muted">{t.outputEmpty}</p>
            )}
          </section>
        </>
      ) : null}
    </Page>
  );
}
