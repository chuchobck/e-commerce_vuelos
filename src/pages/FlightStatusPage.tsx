import { zodResolver } from '@hookform/resolvers/zod';
import { PlaneTakeoff, Search } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Page } from '@/app/layout/Page';
import { FlightStatusCard, FlightStatusSchema, type FlightStatusInput } from '@/features/flight-status';
import { flightsApi, isApiError, type FlightStatus } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { displayToIso, toDisplayDate, today } from '@/shared/lib/dates';
import { sanitizeFlightNumber } from '@/shared/lib/validators';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  EmptyState,
  ErrorState,
  Field,
  FormStatus,
  Input,
  LoadingState,
  MockOnly,
} from '@/shared/ui';

const t = es.status;

const IDS = { flightNumber: 'status-flight', date: 'status-date', status: 'status-form' };

type State = { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'success'; data: FlightStatus };

export function FlightStatusPage() {
  const [state, setState] = useState<State>({ status: 'idle' });
  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FlightStatusInput>({
    resolver: zodResolver(FlightStatusSchema),
    defaultValues: { flightNumber: '', date: toDisplayDate(today()) },
    // El error de un campo aparece al salir de él y se actualiza al escribir; nunca hay un resumen de errores.
    mode: 'onTouched',
  });
  const values = useWatch({ control });
  const ready = FlightStatusSchema.safeParse(values).success;
  const flightFilled = !!values.flightNumber?.trim();
  const dateFilled = !!values.date?.trim();
  const missing = [...(flightFilled ? [] : [t.flightNumber.toLowerCase()]), ...(dateFilled ? [] : [t.date.toLowerCase()])];
  const invalid = [
    ...(flightFilled && !FlightStatusSchema.shape.flightNumber.safeParse(values.flightNumber).success ? [t.flightNumber.toLowerCase()] : []),
    ...(dateFilled && !FlightStatusSchema.shape.date.safeParse(values.date).success ? [t.date.toLowerCase()] : []),
  ];

  const onValid = async (values: FlightStatusInput) => {
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
        <form noValidate onSubmit={handleSubmit(onValid)} className="flex flex-col gap-6">
          <MockOnly>
            <Alert variant="info">
              <p>{t.demoHint}</p>
            </Alert>
          </MockOnly>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field
              id={IDS.flightNumber}
              label={t.flightNumber}
              hint={t.flightNumberHint}
              error={errors.flightNumber?.message}
              required
            >
              <Input
                {...register('flightNumber', { onChange: (e) => setValue('flightNumber', sanitizeFlightNumber(e.target.value)) })}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="characters"
                maxLength={6}
                className="uppercase"
              />
            </Field>
            <Field
              id={IDS.date}
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
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" size="lg" disabled={!ready} loading={state.status === 'loading'} loadingText={t.submitting} aria-describedby={IDS.status}>
              <Search aria-hidden="true" />
              {t.submit}
            </Button>
            <FormStatus id={IDS.status} ready={ready} missing={missing} invalid={invalid} readyText={t.ready} className="min-w-0 flex-1 basis-48" />
          </div>
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
