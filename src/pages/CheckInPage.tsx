import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarCheck, QrCode } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Page } from '@/app/layout/Page';
import { CheckInSchema, type CheckInInput } from '@/features/forms/schemas';
import { flightsApi, type CheckInResult } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatLongDate, formatTime } from '@/shared/lib/format';
import { useErrorSummary } from '@/shared/lib/useErrorSummary';
import { Alert, Button, Card, EmptyState, ErrorState, ErrorSummary, Field, Input, LoadingState } from '@/shared/ui';

const c = es.checkin;

const FIELDS = {
  bookingCode: { id: 'checkin-code', label: c.code },
  lastName: { id: 'checkin-lastname', label: c.lastName },
};

type State = { status: 'idle' } | { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'success'; data: CheckInResult };

export function CheckInPage() {
  const [state, setState] = useState<State>({ status: 'idle' });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitted },
  } = useForm<CheckInInput>({
    resolver: zodResolver(CheckInSchema),
    defaultValues: { bookingCode: '', lastName: '' },
    shouldFocusError: false,
  });
  const { summary, summaryRef, onInvalid, clear } = useErrorSummary<CheckInInput>(FIELDS, errors, isSubmitted);

  const onValid = async (values: CheckInInput) => {
    clear();
    setState({ status: 'loading' });
    try {
      const data = await flightsApi.checkIn(values);
      setState({ status: 'success', data });
    } catch (error) {
      setState({ status: 'error', error });
    }
  };

  return (
    <Page title={c.pageTitle} heading={c.heading} lead={c.lead} width="narrow">
      <Card>
        <form noValidate onSubmit={handleSubmit(onValid, onInvalid)} className="flex flex-col gap-6">
          <ErrorSummary ref={summaryRef} errors={summary} />
          <Alert variant="info">
            <p>{c.demoHint}</p>
          </Alert>
          <Field id={FIELDS.bookingCode.id} label={c.code} hint={c.codeHint} error={errors.bookingCode?.message} required>
            <Input {...register('bookingCode')} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={6} className="uppercase" />
          </Field>
          <Field id={FIELDS.lastName.id} label={c.lastName} hint={c.lastNameHint} error={errors.lastName?.message} required>
            <Input {...register('lastName')} autoComplete="family-name" />
          </Field>
          <Button type="submit" size="lg" loading={state.status === 'loading'} loadingText={c.submitting}>
            <CalendarCheck aria-hidden="true" />
            {c.submit}
          </Button>
        </form>
      </Card>

      <section aria-labelledby="checkin-result" className="flex flex-col gap-4">
        <h2 id="checkin-result" className="sr-only">
          {c.passesTitle}
        </h2>
        {state.status === 'idle' ? (
          <EmptyState title={c.emptyTitle} text={c.emptyText} icon={<QrCode className="size-8" />} headingLevel="h3" />
        ) : state.status === 'loading' ? (
          <LoadingState label={c.submitting} skeletons={1} />
        ) : state.status === 'error' ? (
          <ErrorState error={state.error} headingLevel="h3" />
        ) : (
          <>
            <Alert variant="success" live="polite" title={c.successTitle}>
              <p>{c.successText}</p>
            </Alert>
            <ul className="flex flex-col gap-4">
              {state.data.boardingPasses.map((bp) => (
                <li key={bp.id}>
                  <article className="flex flex-col gap-4 rounded border-2 border-primary bg-surface p-6 shadow-card">
                    <h3 className="text-xl">{fmt(c.boardingPass, { name: bp.passengerName })}</h3>
                    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div>
                        <dt className="text-sm text-muted">{c.flight}</dt>
                        <dd className="text-lg font-bold">{bp.flightNumber}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted">{c.departure}</dt>
                        <dd className="text-lg font-bold">
                          {bp.origin} → {bp.destination}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted">{c.gate}</dt>
                        <dd className="text-lg font-bold">{bp.gate}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted">{c.seat}</dt>
                        <dd className="text-lg font-bold">{bp.seat}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted">{c.boarding}</dt>
                        <dd className="text-lg font-bold tabular-nums">{formatTime(bp.boardingTime)}</dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted">{c.group}</dt>
                        <dd className="text-lg font-bold">{bp.group}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-sm text-muted">{c.departure}</dt>
                        <dd className="text-lg font-bold">
                          {formatLongDate(bp.departureTime)} · {formatTime(bp.departureTime)}
                        </dd>
                      </div>
                    </dl>
                    <p className="break-all text-sm text-muted">{bp.barcode}</p>
                  </article>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </Page>
  );
}
