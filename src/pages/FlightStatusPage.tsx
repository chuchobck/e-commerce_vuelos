import { zodResolver } from '@hookform/resolvers/zod';
import { PlaneTakeoff, Search } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Page } from '@/app/layout/Page';
import { FlightStatusCard, FlightStatusSchema, type FlightStatusInput } from '@/features/flight-status';
import { flightsApi, isApiError, type FlightStatus } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { displayToIso, toDisplayDate, today } from '@/shared/lib/dates';
import { useErrorSummary } from '@/shared/lib/useErrorSummary';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  EmptyState,
  ErrorState,
  ErrorSummary,
  Field,
  Input,
  LoadingState,
  MockOnly,
} from '@/shared/ui';

const t = es.status;

const FIELDS = {
  flightNumber: { id: 'status-flight', label: t.flightNumber },
  date: { id: 'status-date', label: t.date },
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
          <MockOnly>
            <Alert variant="info">
              <p>{t.demoHint}</p>
            </Alert>
          </MockOnly>
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
          <FlightStatusCard status={state.data} />
        )}
      </section>
    </Page>
  );
}
