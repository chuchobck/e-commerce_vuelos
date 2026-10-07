import { Bug, Plane, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Page } from '@/app/layout/Page';
import {
  ApiError,
  getForcedError,
  MOCK_OPERATIONS,
  setForcedError,
  SIMULATED_STATUSES,
  type SimulatedStatus,
} from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  NumericInput,
  RadioGroup,
  Select,
  Skeleton,
  Stepper,
  Timer,
  toast,
} from '@/shared/ui';

const k = es.uiKit;

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`kit-${title}`} className="flex flex-col gap-4">
      <h2 id={`kit-${title}`} className="text-2xl">
        {title}
      </h2>
      <Card className="flex flex-col gap-6">{children}</Card>
    </section>
  );
}

const inTwoMinutes = () => new Date(Date.now() + 130_000).toISOString();

/** Catálogo del sistema de diseño (ruta /componentes, no enlazada en la navegación). */
export function UiKitPage() {
  const [date, setDate] = useState('');
  const [cedula, setCedula] = useState('');
  const [doc, setDoc] = useState('CEDULA');
  const [checked, setChecked] = useState(false);
  const [expiresAt, setExpiresAt] = useState(inTwoMinutes);
  const [op, setOp] = useState('*');
  const [status, setStatus] = useState<SimulatedStatus>(503);
  const [forced, setForced] = useState(getForcedError);

  return (
    <Page title={k.pageTitle} heading={k.heading} lead={k.lead}>
      <Block title={k.buttons}>
        <div className="flex flex-wrap gap-4">
          <Button>
            <Search aria-hidden="true" />
            {es.common.searchFlights}
          </Button>
          <Button variant="accent">{es.common.continue}</Button>
          <Button variant="secondary">{es.common.edit}</Button>
          <Button variant="ghost">{es.common.back}</Button>
          <Button variant="danger">{es.common.cancel}</Button>
        </div>
        <div className="flex flex-wrap gap-4">
          <Button disabled>{k.buttonsDisabled}</Button>
          <Button loading loadingText={k.buttonsLoading}>
            {es.common.confirm}
          </Button>
          <Button size="icon" variant="secondary" aria-label={es.common.searchFlights}>
            <Plane aria-hidden="true" />
          </Button>
        </div>
      </Block>

      <Block title={k.fields}>
        <div className="grid items-start gap-6 md:grid-cols-2">
          <Field label={k.sampleName} hint={es.validation.nameLength} required>
            <Input autoComplete="off" />
          </Field>
          <Field label={k.sampleNameError} error={es.validation.nameInvalid} required>
            <Input defaultValue="Juan123" autoComplete="off" />
          </Field>
          <Field label={k.sampleDisabled}>
            <Input disabled defaultValue="QD7K2M" />
          </Field>
          <Field label={k.sampleCedula} hint={es.auth.cedulaHint} required>
            <NumericInput value={cedula} onValueChange={setCedula} maxDigits={10} />
          </Field>
          <Field label={k.sampleSelect}>
            <Select
              placeholder={es.search.choose}
              options={[
                { value: 'UIO', label: 'Quito (UIO)' },
                { value: 'GYE', label: 'Guayaquil (GYE)' },
              ]}
            />
          </Field>
          <Field label={k.sampleDate} hint={fmt(es.common.dateFormatHint, { example: '15/10/2026' })}>
            <DatePicker value={date} onValueChange={setDate} calendarLabel={k.sampleDate.toLowerCase()} />
          </Field>
        </div>
        <Checkbox label={k.sampleCheckbox} checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
        <RadioGroup
          legend={k.sampleRadio}
          value={doc}
          onValueChange={setDoc}
          options={[
            { value: 'CEDULA', label: es.auth.cedula, hint: es.auth.cedulaHint },
            { value: 'PASSPORT', label: es.auth.passport, hint: es.auth.passportHint },
          ]}
        />
      </Block>

      <Block title={k.feedback}>
        <Alert variant="info" title={k.infoTitle}>
          <p>{k.infoText}</p>
        </Alert>
        <Alert variant="success" title={k.successTitle}>
          <p>{k.successText}</p>
        </Alert>
        <Alert variant="warning" title={k.warningTitle}>
          <p>{k.warningText}</p>
        </Alert>
        <Alert variant="error" title={k.errorTitle}>
          <p>{k.errorText}</p>
        </Alert>
        <div className="flex flex-wrap gap-4">
          <Button variant="secondary" onClick={() => toast({ title: k.toastTitle, variant: 'success' })}>
            {k.toastButton}
          </Button>
          <Button variant="secondary" onClick={() => toast({ title: es.errors.unavailable503, variant: 'error' })}>
            {k.toastError}
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">{k.dialogButton}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>{k.dialogTitle}</DialogTitle>
              <DialogDescription>{k.dialogText}</DialogDescription>
            </DialogContent>
          </Dialog>
        </div>
      </Block>

      <Block title={k.badges}>
        <div className="flex flex-wrap gap-4">
          <Badge tone="success">{es.trip.status.CONFIRMED}</Badge>
          <Badge tone="info">{es.trip.status.CHECKED_IN}</Badge>
          <Badge tone="warning">{es.status.states.DELAYED}</Badge>
          <Badge tone="error">{es.trip.status.CANCELLED}</Badge>
          <Badge tone="neutral">{es.status.states.SCHEDULED}</Badge>
        </div>
      </Block>

      <Block title={k.stepperTitle}>
        <Stepper steps={[es.purchase.steps.flight, es.purchase.steps.account, es.purchase.steps.payment]} current={1} />
      </Block>

      <Block title={k.timerTitle}>
        <Timer expiresAt={expiresAt} onExtend={() => setExpiresAt(inTwoMinutes())} />
        <div>
          <Button variant="ghost" onClick={() => setExpiresAt(inTwoMinutes())}>
            {k.timerRestart}
          </Button>
        </div>
      </Block>

      <Block title={k.statesTitle}>
        <LoadingState />
        <EmptyState title={es.trips.emptyTitle} text={es.trips.emptyText} headingLevel="h3" />
        <ErrorState error={new ApiError(503, 'SERVICE_UNAVAILABLE')} onRetry={() => undefined} headingLevel="h3" />
        <p className="font-bold">{k.skeletonTitle}</p>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
      </Block>

      <Block title={k.mockTitle}>
        <p>{k.mockLead}</p>
        <div className="grid items-end gap-4 md:grid-cols-[1fr_1fr_auto]">
          <Field label={k.mockOperation}>
            <Select
              value={op}
              onChange={(e) => setOp(e.target.value)}
              options={[{ value: '*', label: k.mockAll }, ...MOCK_OPERATIONS.map((o) => ({ value: o, label: o }))]}
            />
          </Field>
          <Field label={k.mockStatus}>
            <Select
              value={String(status)}
              onChange={(e) => setStatus(Number(e.target.value) as SimulatedStatus)}
              options={SIMULATED_STATUSES.map((s) => ({ value: String(s), label: String(s) }))}
            />
          </Field>
          <Button
            onClick={() => {
              setForcedError(op, status);
              setForced(getForcedError());
              toast({ title: k.mockApplied, variant: 'info' });
            }}
          >
            <Bug aria-hidden="true" />
            {k.mockApply}
          </Button>
        </div>
        <Alert variant={forced ? 'warning' : 'info'} live="polite">
          <p>{forced ? fmt(k.mockActive, { value: forced }) : k.mockNone}</p>
        </Alert>
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setForcedError(op, null);
              setForced(null);
              toast({ title: k.mockCleared, variant: 'success' });
            }}
          >
            {k.mockClear}
          </Button>
        </div>
      </Block>
    </Page>
  );
}
