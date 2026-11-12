import { Search } from 'lucide-react';
import { useId } from 'react';
import { es } from '@/shared/i18n';
import { Alert, Button, Field, FormStatus, Input, MockOnly } from '@/shared/ui';
import { identificationIssues } from './identification';
import type { KioskBusy } from './useKioskFlow';

const t = es.kiosk.identify;

interface IdentifyStepProps {
  pnr: string;
  lastName: string;
  busy: KioskBusy;
  error: string | null;
  notice: string | null;
  onPnr: (value: string) => void;
  onLastName: (value: string) => void;
  onSubmit: () => void;
}

/** Paso 1: código de reserva y apellido. El botón se activa cuando los datos son válidos y `FormStatus` dice qué falta. */
export function IdentifyStep({ pnr, lastName, busy, error, notice, onPnr, onLastName, onSubmit }: IdentifyStepProps) {
  const statusId = useId();
  const { missing, pnrError, ready } = identificationIssues({ pnr, lastName });
  const loading = busy === 'lookup';
  return (
    <form
      noValidate
      autoComplete="off"
      className="flex max-w-2xl flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !loading) onSubmit();
      }}
    >
      {notice ? <Alert variant="info" live="polite"><p>{notice}</p></Alert> : null}
      <Field label={t.pnr} hint={t.pnrHint} error={pnrError} required>
        <Input
          value={pnr}
          onChange={(e) => onPnr(e.target.value)}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          maxLength={6}
          className="h-16 text-3xl font-bold uppercase tracking-widest"
        />
      </Field>
      <Field label={t.lastName} hint={t.lastNameHint} required>
        <Input value={lastName} onChange={(e) => onLastName(e.target.value)} autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={100} className="h-16 text-2xl" />
      </Field>
      {error ? (
        <Alert variant="error" live="assertive">
          <p>{error}</p>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" className="min-h-16 text-xl sm:w-fit" disabled={!ready} loading={loading} loadingText={t.submitting} aria-describedby={statusId}>
          <Search aria-hidden="true" />
          {t.submit}
        </Button>
        <FormStatus id={statusId} ready={ready} missing={missing} invalid={pnrError ? [t.missingPnr] : []} readyText={t.ready} />
      </div>
      <MockOnly>
        <p className="text-sm text-muted">{t.mockHint}</p>
      </MockOnly>
    </form>
  );
}
