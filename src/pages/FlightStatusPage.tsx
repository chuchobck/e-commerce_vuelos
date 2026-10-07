import { zodResolver } from '@hookform/resolvers/zod';
import { PlaneTakeoff, Search } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Page } from '@/app/layout/Page';
import { FlightStatusSchema, type FlightStatusInput } from '@/features/forms';
import { flightsApi, isApiError, type FlightStatus, type FlightStatusCode } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { displayToIso, toDisplayDate, today } from '@/shared/lib/dates';
import { formatLongDate, formatTime } from '@/shared/lib/format';
import { useErrorSummary } from '@/shared/lib/useErrorSummary';
import {
  Alert,
  Badge,
  Button,
  Card,
  DatePicker,
  EmptyState,
  ErrorState,
  ErrorSummary,
  Field,
  Input,
  LoadingState,
} from '@/shared/ui';

const t = es.status;

const FIELDS = {
  flightNumber: { id: 'status-flight', label: t.flightNumber },
  date: { id: 'status-date', label: t.date },
};

const TONE: Record<FlightStatusCode, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  SCHEDULED: 'neutral',
  ON_TIME: 'success',
  DELAYED: 'warning',
  BOARDING: 'info',
  DEPARTED: 'info',
  LANDED: 'success',
  CANCELLED: 'error',
};

type State = { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'success'; data: FlightStatus };

export function FlightStatusPage() {
  const [state, setState] = useState<State>({ status: 'idle' });
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitted },
  } = useForm<FlightStatusInput>({
    resolver: zodResolver(FlightStatusSchema),
    defaultValues: { flightNumber: '', date: toDisplayDate(today()) },
    shouldFocusError: false,
  });
  const { summary, summaryRef, onInvalid, clear } = useErrorSummary<FlightStatusInput>(FIELDS, errors, isSubmitted);

  const onValid = async (values: FlightStatusInput) => {
    clear();
    setState({ status: 'loading' });
    try {
      const data = await flightsApi.getFlightStatus(values.flightNumber, displayToIso(values.date));
      setState({ status: 'success', data });
    } catch (error) {
      setState({ status: 'error', error });
    }
  };

  return (
    <Page title={t.pageTitle} heading={t.heading} lead={t.lead} width="narrow">
      <Card>
        <form noValidate onSubmit={handleSubmit(onValid, onInvalid)} className="flex flex-col gap-6">
          <ErrorSummary ref={summaryRef} errors={summary} />
          <Alert variant="info">
            <p>{t.demoHint}</p>
          </Alert>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field
              id={FIELDS.flightNumber.id}
              label={t.flightNumber}
              hint={t.flightNumberHint}
              error={errors.flightNumber?.message}
              required
            >
              <Input {...register('flightNumber')} autoComplete="off" spellCheck={false} maxLength={6} className="uppercase" />
            </Field>
            <Field
              id={FIELDS.date.id}
              label={t.date}
              hint={fmt(es.common.dateFormatHint, { example: '15/10/2026' })}
              error={errors.date?.message}
              required
            >
              <Controller
                control={control}
                name="date"
                render={({ field }) => (
                  <DatePicker
                    ref={field.ref}
                    name={field.name}
                    value={field.value}
                    onBlur={field.onBlur}
                    onValueChange={field.onChange}
                    calendarLabel={t.date.toLowerCase()}
                  />
                )}
              />
            </Field>
          </div>
          <Button type="submit" size="lg" loading={state.status === 'loading'} loadingText={t.submitting}>
            <Search aria-hidden="true" />
            {t.submit}
          </Button>
        </form>
      </Card>

      <section aria-labelledby="status-result" className="flex flex-col gap-4">
        <h2 id="status-result" className="sr-only">
          {t.resultLabel}
        </h2>
        {state.status === 'idle' ? (
          <EmptyState title={t.emptyTitle} text={t.emptyText} icon={<PlaneTakeoff className="size-8" />} headingLevel="h3" />
        ) : state.status === 'loading' ? (
          <LoadingState label={t.submitting} skeletons={1} />
        ) : state.status === 'error' ? (
          isApiError(state.error) && state.error.status === 404 ? (
            <div role="alert">
              <EmptyState title={t.notFoundTitle} text={t.notFoundText} headingLevel="h3" />
            </div>
          ) : (
            <ErrorState error={state.error} headingLevel="h3" />
          )
        ) : (
          <article role="status" className="flex flex-col gap-6 rounded border-2 border-border bg-surface p-6 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h3 className="text-xl">
                {fmt(t.resultHeading, { flight: state.data.flightNumber, date: formatLongDate(state.data.date) })}
              </h3>
              <Badge tone={TONE[state.data.status]}>{t.states[state.data.status]}</Badge>
            </div>
            <p className="text-lg font-bold">
              {fmt(es.results.route, { origin: state.data.origin, destination: state.data.destination })}
            </p>
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                { title: t.departure, scheduled: state.data.scheduledDeparture, estimated: state.data.estimatedDeparture },
                { title: t.arrival, scheduled: state.data.scheduledArrival, estimated: state.data.estimatedArrival },
              ].map((row) => (
                <div key={row.title} className="flex flex-col gap-2 rounded border-2 border-border p-4">
                  <dt className="font-bold">{row.title}</dt>
                  <dd className="flex flex-col">
                    <span>
                      {t.scheduledTime}: <span className="font-bold tabular-nums">{formatTime(row.scheduled)}</span>
                    </span>
                    <span>
                      {t.estimatedTime}: <span className="font-bold tabular-nums">{formatTime(row.estimated)}</span>
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-muted">
              {state.data.gate ? `${fmt(t.gate, { gate: state.data.gate })} · ` : ''}
              {fmt(t.updated, { time: new Date(state.data.updatedAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }) })}
            </p>
          </article>
        )}
      </section>
    </Page>
  );
}
