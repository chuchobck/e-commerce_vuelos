import { ArrowLeft, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { useAuth } from '@/features/auth';
import {
  amountDue,
  DateChangeOptions,
  DateChangePrice,
  isPaymentReference,
  needsPayment,
  newDateProblem,
  newPaymentReference,
  PaymentField,
  PostSaleNotice,
  suggestedDate,
  useDateChange,
} from '@/features/aftersale';
import { TripFallback, useBooking } from '@/features/trips';
import { errorMessage, isApiError, type Booking, type Itinerary } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { lastFlightDate, toDisplayDate, today } from '@/shared/lib/dates';
import { formatLongDate, formatMoney, formatTime } from '@/shared/lib/format';
import { Button, Card, DatePicker, EmptyState, Field, RadioGroup, Stepper, TripSummary } from '@/shared/ui';

const t = es.aftersale.dateChange;

/** Los itinerarios que se pueden cambiar (ida y, si hay, vuelta), con su etiqueta. */
function legsOf(booking: Booking): { itinerary: Pick<Itinerary, 'id' | 'segments'>; label: string }[] {
  return [
    { itinerary: booking.outbound.itinerary, label: es.aftersale.legs.outbound },
    ...(booking.inbound ? [{ itinerary: booking.inbound.itinerary, label: es.aftersale.legs.inbound }] : []),
  ];
}

const routeOf = (it: Pick<Itinerary, 'segments'>) => `${it.segments[0].origin} → ${it.segments[it.segments.length - 1].destination}`;

/**
 * Cambio de fecha: 1) nueva fecha → búsqueda, 2) alternativas con la diferencia de tarifa, 3) confirmación con el antes y
 * el después (y pago simulado si hay algo que pagar). Al terminar se refresca la reserva y se muestra el nuevo vuelo.
 * 200 hecho · 202 en proceso (CHANGE_PENDING) · 422 pago rechazado (se conserva la elección) · 410 oferta vencida.
 */
export function TripDateChangePage() {
  const { id = '' } = useParams();
  const { authorized } = useAuth();
  const trip = useBooking(id, authorized);
  const booking = trip.booking;
  const flow = useDateChange(id, authorized, () => void trip.refresh());
  const { state } = flow;

  const [itineraryId, setItineraryId] = useState('');
  const [dateText, setDateText] = useState('');
  const [dateError, setDateError] = useState<string | undefined>();
  const [reference, setReference] = useState(() => newPaymentReference('OK'));
  const [referenceError, setReferenceError] = useState<string | undefined>();
  const [checked, setChecked] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Con la reserva cargada se empieza con la ida y una fecha sugerida (el día siguiente), para no partir en blanco.
  useEffect(() => {
    if (!booking || itineraryId) return;
    setItineraryId(booking.outbound.itinerary.id);
    setDateText(toDisplayDate(suggestedDate(booking.outbound.itinerary)));
  }, [booking, itineraryId]);

  const legs = booking ? legsOf(booking) : [];
  const leg = legs.find((l) => l.itinerary.id === itineraryId) ?? legs[0];
  const stepIndex = { search: 0, options: 1, confirm: 2, result: 3 }[state.step];

  const submitSearch = () => {
    if (!leg) return;
    const checkedDate = newDateProblem(dateText, leg.itinerary);
    if ('problem' in checkedDate) {
      setDateError(checkedDate.problem === 'same' ? t.same : checkedDate.problem === 'past' ? t.past : es.validation.dateInvalid);
      return;
    }
    setDateError(undefined);
    void flow.search(leg.itinerary.id, checkedDate.date);
  };

  const submitConfirm = () => {
    const chosen = state.chosen;
    if (!chosen) return;
    if (needsPayment(chosen.price) && !isPaymentReference(reference)) {
      setReferenceError(es.aftersale.payment.invalid);
      return;
    }
    setReferenceError(undefined);
    void flow.confirm(reference);
  };

  // Tras un rechazo, la referencia se cambia por una nueva para que el reintento sea otro pago.
  useEffect(() => {
    if (state.problem === 'rejected' || state.problem === 'reference') setReference(newPaymentReference('OK'));
  }, [state.problem]);

  const checkPending = async () => {
    setRefreshing(true);
    const fresh = await trip.refresh();
    setRefreshing(false);
    setChecked(true);
    if (fresh && fresh.status !== 'CHANGE_PENDING') setResolved(true);
  };

  let content;
  if (!booking || !leg) {
    content = <TripFallback state={trip} onRetry={() => void trip.refresh()} />;
  } else if (booking.status === 'CANCELLED' || booking.status === 'FAILED') {
    content = <EmptyState title={es.aftersale.actions.noActions} />;
  } else if (!booking.outbound.fare.changeable || (booking.inbound && !booking.inbound.fare.changeable)) {
    content = <EmptyState title={t.notChangeableTitle} text={t.notChangeableText} action={
      <Button asChild>
        <Link to={routes.trip(id)}>{t.backToTrip}</Link>
      </Button>
    } />;
  } else if (state.step === 'result') {
    const pending = state.outcome === 'pending' && !resolved && booking.status === 'CHANGE_PENDING';
    content = (
      <>
        {pending ? (
          <PostSaleNotice tone="pending" title={t.pendingTitle} onRefresh={() => void checkPending()} refreshing={refreshing} refreshLabel={t.pendingRefresh}>
            <p>{t.pendingText}</p>
            {checked ? <p role="status">{t.pendingStill}</p> : null}
          </PostSaleNotice>
        ) : (
          <PostSaleNotice tone="success" title={state.outcome === 'pending' ? t.pendingDone : t.successTitle}>
            <p>{t.successText}</p>
          </PostSaleNotice>
        )}
        <Card className="flex flex-col gap-4">
          <h2 className="text-xl">{t.newFlight}</h2>
          <TripSummary outbound={booking.outbound} inbound={booking.inbound} />
        </Card>
        <div>
          <Button asChild>
            <Link to={routes.trip(id)}>
              <ArrowLeft aria-hidden="true" />
              {t.backToTrip}
            </Link>
          </Button>
        </div>
      </>
    );
  } else if (state.step === 'confirm' && state.chosen) {
    const chosen = state.chosen;
    const first = chosen.segments[0];
    const last = chosen.segments[chosen.segments.length - 1];
    const due = amountDue(chosen.price);
    const direction = chosen.price.total.cents;
    const current = leg.itinerary.segments;
    content = (
      <>
        <Card className="flex flex-col gap-6">
          <h2 className="text-xl">{t.summaryTitle}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <section aria-label={t.before} className="flex flex-col gap-1 rounded border-2 border-border p-4">
              <h3 className="font-bold">{t.before}</h3>
              <p>{formatLongDate(current[0].departureTime)}</p>
              <p className="tabular-nums">
                {formatTime(current[0].departureTime)} {current[0].origin} → {formatTime(current[current.length - 1].arrivalTime)} {current[current.length - 1].destination}
              </p>
              <p className="text-sm text-muted">{fmt(t.optionFlight, { flight: current.map((s) => s.flightNumber).join(' + ') })}</p>
            </section>
            <section aria-label={t.after} className="flex flex-col gap-1 rounded border-2 border-primary bg-primary-tint p-4">
              <h3 className="font-bold">{t.after}</h3>
              <p>{formatLongDate(first.departureTime)}</p>
              <p className="tabular-nums">
                {formatTime(first.departureTime)} {first.origin} → {formatTime(last.arrivalTime)} {last.destination}
              </p>
              <p className="text-sm text-muted">{fmt(t.optionFlight, { flight: chosen.segments.map((s) => s.flightNumber).join(' + ') })}</p>
            </section>
          </div>
          <DateChangePrice price={chosen.price} />
          <p className="text-sm text-muted">{t.seatsNote}</p>
        </Card>

        {state.problem === 'rejected' ? (
          <PostSaleNotice tone="rejected" title={t.rejectedTitle}>
            <p>{t.rejectedText}</p>
          </PostSaleNotice>
        ) : state.confirmError ? (
          <PostSaleNotice tone="error" title={es.states.errorTitle}>
            <p>{errorMessage(state.confirmError)}</p>
          </PostSaleNotice>
        ) : null}

        {needsPayment(chosen.price) ? <PaymentField id="date-change-payment" value={reference} onChange={setReference} error={referenceError} /> : null}

        <div className="flex flex-wrap gap-4">
          <Button size="lg" onClick={submitConfirm} loading={state.confirming} loadingText={t.confirming}>
            {direction > 0 ? fmt(t.confirmPay, { total: formatMoney(due) }) : direction < 0 ? fmt(t.confirmRefund, { total: formatMoney({ cents: -direction, currency: chosen.price.total.currency }) }) : t.confirm}
          </Button>
          <Button variant="secondary" disabled={state.confirming} onClick={flow.backToOptions}>
            {t.back}
          </Button>
        </div>
      </>
    );
  } else if (state.step === 'options' && state.options) {
    content = (
      <>
        <h2 className="text-xl">{fmt(t.optionsTitle, { date: formatLongDate(state.date ?? '') })}</h2>
        {state.options.length === 0 ? (
          <EmptyState title={t.noOptionsTitle} text={t.noOptionsText} headingLevel="h3" action={<Button onClick={flow.backToSearch}>{t.stepSearch}</Button>} />
        ) : (
          <DateChangeOptions options={state.options} onChoose={flow.choose} />
        )}
        {state.options.length > 0 ? (
          <div>
            <Button variant="secondary" onClick={flow.backToSearch}>
              {t.stepSearch}
            </Button>
          </div>
        ) : null}
      </>
    );
  } else {
    content = (
      <>
        <Card className="flex flex-col gap-4">
          <h2 className="text-xl">{t.currentFlight}</h2>
          <TripSummary outbound={booking.outbound} inbound={booking.inbound} />
        </Card>

        {state.searchError ? (
          <PostSaleNotice tone={isApiError(state.searchError) && state.searchError.code === 'FARE_NOT_CHANGEABLE' ? 'warning' : 'error'} title={es.states.errorTitle}>
            <p>{errorMessage(state.searchError)}</p>
          </PostSaleNotice>
        ) : null}

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch();
          }}
          className="flex flex-col gap-6"
        >
          {legs.length > 1 ? (
            <RadioGroup
              legend={t.legLabel}
              appearance="list"
              orientation="vertical"
              value={leg.itinerary.id}
              onValueChange={(value) => {
                setItineraryId(value);
                const next = legs.find((l) => l.itinerary.id === value);
                if (next) setDateText(toDisplayDate(suggestedDate(next.itinerary)));
                setDateError(undefined);
              }}
              options={legs.map((l) => ({ value: l.itinerary.id, label: fmt(t.legOption, { label: l.label, route: routeOf(l.itinerary), date: formatLongDate(l.itinerary.segments[0].departureTime) }) }))}
            />
          ) : null}
          <Field id="date-change-date" label={t.newDate} hint={t.newDateHint} error={dateError} required>
            <DatePicker value={dateText} onValueChange={setDateText} calendarLabel={t.newDate.toLowerCase()} minDate={today()} maxDate={lastFlightDate()} />
          </Field>
          <div>
            <Button type="submit" size="lg" loading={state.searching} loadingText={t.searching}>
              <Search aria-hidden="true" />
              {t.search}
            </Button>
          </div>
        </form>
      </>
    );
  }

  const showStepper = booking && state.step !== 'result' && booking.outbound.fare.changeable;
  return (
    <Page title={booking ? `${t.pageTitle} ${booking.code}` : t.pageTitle} heading={booking ? fmt(t.heading, { code: booking.code }) : t.pageTitle} lead={t.lead} width="narrow">
      {showStepper ? <Stepper steps={[t.stepSearch, t.stepOptions, t.stepConfirm]} current={stepIndex} label={t.stepsLabel} /> : null}
      {content}
      {state.step !== 'result' ? (
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
