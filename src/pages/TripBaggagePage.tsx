import { ArrowLeft, Luggage } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { useAuth } from '@/features/auth';
import {
  baggageTotal,
  BaggageSelector,
  isPaymentReference,
  lineKey,
  newPaymentReference,
  overallOf,
  PaymentField,
  PostSaleNotice,
  purchaseBaggage,
  selectedLines,
  totalBags,
  type BaggageSelection,
  type LineResult,
} from '@/features/aftersale';
import { TripFallback, useBooking } from '@/features/trips';
import { errorMessage, flightsApi } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { attemptKeys } from '@/shared/lib/attemptKeys';
import { formatMoney } from '@/shared/lib/format';
import { useAsync } from '@/shared/lib/useAsync';
import { Button, Card, EmptyState, ErrorState, FormStatus, LoadingState } from '@/shared/ui';

const t = es.aftersale.baggage;

type Step = 'select' | 'review' | 'result';

/**
 * Equipaje extra: elegir cantidades por pasajero (total en vivo) → resumen de cobro y pago simulado → resultado.
 * 200/201 listo, 202 "pago en proceso" (con botón para actualizar) y 422 rechazado: se puede reintentar con otro pago SIN
 * perder lo elegido. Cada maleta es una petición con su Idempotency-Key (una por intento).
 */
export function TripBaggagePage() {
  const { id = '' } = useParams();
  const { authorized } = useAuth();
  const trip = useBooking(id, authorized);
  const options = useAsync(() => authorized(() => flightsApi.getBaggageOptions(id)), [id]);
  const booking = trip.booking;
  // La API también manda una fila para el infante con máximo 0 (no lleva maleta extra): no hay nada que elegir ahí.
  const list = useMemo(() => (options.status === 'success' ? options.data.filter((o) => o.maxAllowed > 0) : []), [options.status, options.data]);

  const [step, setStep] = useState<Step>('select');
  const [selection, setSelection] = useState<BaggageSelection>({});
  const [reference, setReference] = useState(() => newPaymentReference('OK'));
  const [paying, setPaying] = useState(false);
  const [results, setResults] = useState<LineResult[] | null>(null);
  const [attempted, setAttempted] = useState(0);
  const [boughtBefore, setBoughtBefore] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [checkedOnce, setCheckedOnce] = useState(false);

  const lines = useMemo(() => selectedLines(list, selection), [list, selection]);
  const total = useMemo(() => baggageTotal(list, selection), [list, selection]);
  const bags = totalBags(list, selection);
  const overall = results ? overallOf(results, attempted) : null;

  const nameOf = (passengerId: string) => {
    const p = booking?.passengers.find((x) => x.id === passengerId);
    return p ? `${p.firstName} ${p.lastName}` : passengerId;
  };
  const legOf = (itineraryId: string) => {
    const outbound = booking?.outbound.itinerary;
    const leg = outbound?.id === itineraryId ? outbound : booking?.inbound?.itinerary;
    const first = leg?.segments[0];
    const last = leg?.segments[leg.segments.length - 1];
    const label = outbound?.id === itineraryId ? es.aftersale.legs.outbound : es.aftersale.legs.inbound;
    return first && last ? fmt(t.leg, { label, route: `${first.origin} → ${last.destination}` }) : label;
  };

  const referenceOk = isPaymentReference(reference);
  const purchasedCount = () => list.reduce((n, o) => n + o.alreadyPurchased, 0);

  const pay = async () => {
    if (paying || !referenceOk) return;
    setPaying(true);
    setBoughtBefore(purchasedCount());
    const toBuy = lines.map((l) => ({ passengerId: l.option.passengerId, itineraryId: l.option.itineraryId, quantity: l.quantity }));
    const out = await purchaseBaggage(id, toBuy, reference, {
      add: (bookingId, request, key) => authorized(() => flightsApi.addBaggage(bookingId, request, key)),
      keys: attemptKeys,
    });
    setResults(out);
    setAttempted(toBuy.length);
    // Lo ya comprado sale de la selección; lo demás se conserva para reintentar.
    const next = { ...selection };
    for (const r of out) if (r.status === 'done' || r.status === 'pending') delete next[lineKey(r.passengerId, r.itineraryId)];
    setSelection(next);
    setPaying(false);
    setResolved(false);
    setCheckedOnce(false);
    const summary = overallOf(out, toBuy.length);
    if (summary === 'done' || summary === 'pending') setStep('result');
    // Tras un rechazo la referencia ya no sirve: se deja una nueva para reintentar (se puede escribir otra).
    else setReference(newPaymentReference('OK'));
    void options.execute();
    void trip.refresh();
  };

  const checkPending = async () => {
    setRefreshing(true);
    const fresh = await options.execute();
    await trip.refresh();
    setRefreshing(false);
    setCheckedOnce(true);
    if (fresh && fresh.reduce((n, o) => n + o.alreadyPurchased, 0) > boughtBefore) setResolved(true);
  };

  const restart = () => {
    setStep('select');
    setResults(null);
    setReference(newPaymentReference('OK'));
    setResolved(false);
  };

  let content;
  if (!booking) {
    content = <TripFallback state={trip} onRetry={() => void trip.refresh()} />;
  } else if (options.status === 'loading' || options.status === 'idle') {
    content = <LoadingState label={t.loading} skeletons={2} />;
  } else if (options.status === 'error') {
    content = <ErrorState error={options.error} onRetry={() => void options.execute()} />;
  } else if (list.length === 0) {
    content = <EmptyState title={t.noOptionsTitle} text={t.noOptionsText} icon={<Luggage className="size-8" />} />;
  } else if (step === 'result' && results && overall) {
    const done = results.filter((r) => r.status === 'done');
    content = (
      <>
        {overall === 'pending' && !resolved ? (
          <PostSaleNotice tone="pending" title={t.pendingTitle} onRefresh={() => void checkPending()} refreshing={refreshing} refreshLabel={t.pendingRefresh}>
            <p>{t.pendingText}</p>
          </PostSaleNotice>
        ) : (
          <PostSaleNotice tone="success" title={overall === 'pending' ? t.pendingDone : t.successTitle}>
            <p>{t.successText}</p>
            <ul className="mt-2 list-disc pl-6">
              {done.map((r) => (
                <li key={`${r.passengerId}-${r.itineraryId}`}>
                  {fmt(t.successLine, { passenger: nameOf(r.passengerId), count: r.totalBaggage ?? '', leg: legOf(r.itineraryId) })}
                </li>
              ))}
            </ul>
          </PostSaleNotice>
        )}
        {overall === 'pending' && !resolved && checkedOnce ? <p role="status">{t.pendingStill}</p> : null}
        <div className="flex flex-wrap gap-4">
          <Button asChild>
            <Link to={routes.trip(id)}>
              <ArrowLeft aria-hidden="true" />
              {t.backToTrip}
            </Link>
          </Button>
          <Button variant="secondary" onClick={restart}>
            {t.more}
          </Button>
        </div>
      </>
    );
  } else if (step === 'review') {
    content = (
      <>
        <Card className="flex flex-col gap-4">
          <h2 className="text-xl">{t.reviewTitle}</h2>
          <ul className="flex flex-col divide-y-2 divide-border">
            {lines.map((l) => (
              <li key={lineKey(l.option.passengerId, l.option.itineraryId)} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>{fmt(t.reviewLine, { qty: l.quantity, passenger: nameOf(l.option.passengerId), leg: legOf(l.option.itineraryId) })}</span>
                <span className="font-bold tabular-nums">{formatMoney(l.subtotal)}</span>
              </li>
            ))}
          </ul>
          <p className="flex items-baseline justify-between gap-4 text-xl font-bold">
            <span>{t.total}</span>
            <span className="tabular-nums">{formatMoney(total)}</span>
          </p>
        </Card>

        {overall === 'rejected' ? (
          <PostSaleNotice tone="rejected" title={t.rejectedTitle}>
            <p>{t.rejectedText}</p>
          </PostSaleNotice>
        ) : null}
        {overall === 'partial' ? (
          <PostSaleNotice tone="warning" title={t.partialTitle}>
            <p>{t.partialText}</p>
          </PostSaleNotice>
        ) : null}
        {overall === 'failed' || overall === 'partial' ? (
          <PostSaleNotice tone="error" title={es.states.errorTitle}>
            <p>{errorMessage(results?.find((r) => r.error)?.error)}</p>
          </PostSaleNotice>
        ) : null}

        <PaymentField id="baggage-payment" value={reference} onChange={setReference} />
        <div className="flex flex-wrap gap-4">
          <Button size="lg" onClick={() => void pay()} loading={paying} loadingText={t.paying} disabled={!referenceOk} aria-describedby="baggage-status">
            {fmt(t.pay, { total: formatMoney(total) })}
          </Button>
          <Button variant="secondary" disabled={paying} onClick={() => setStep('select')}>
            {t.edit}
          </Button>
        </div>
        <FormStatus id="baggage-status" ready={referenceOk} invalid={referenceOk ? [] : [es.aftersale.payment.label.toLowerCase()]} readyText={es.aftersale.payment.ready} />
      </>
    );
  } else {
    content = (
      <>
        <BaggageSelector options={list} selection={selection} onChange={setSelection} nameOf={nameOf} legOf={legOf} />
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-4 rounded border-2 border-primary bg-surface p-4 shadow-raised">
          <p role="status" className="text-lg font-bold">
            {bags === 0 ? t.nothingSelected : fmt(t.totalLive, { total: formatMoney(total) })}
          </p>
          <Button size="lg" disabled={bags === 0} onClick={() => setStep('review')}>
            {t.continue}
          </Button>
        </div>
      </>
    );
  }

  return (
    <Page title={booking ? `${t.pageTitle} ${booking.code}` : t.pageTitle} heading={booking ? fmt(t.heading, { code: booking.code }) : t.pageTitle} lead={t.lead} width="narrow">
      {content}
      {step !== 'result' ? (
        <div>
          <Button asChild variant="ghost">
            <Link to={routes.trip(id)}>
              <ArrowLeft aria-hidden="true" />
              {es.trip.backToTrip}
            </Link>
          </Button>
        </div>
      ) : null}
    </Page>
  );
}
