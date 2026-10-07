import { zodResolver } from '@hookform/resolvers/zod';
import { CreditCard } from 'lucide-react';
import { useRef, type FormEvent } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { apiConfig, type Money } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatMoney } from '@/shared/lib/format';
import { cardExpiryField, cardNumberField, cvvField } from '@/shared/lib/schemas';
import { onlyDigits } from '@/shared/lib/validators';
import { payments, TEST_CARDS, wipeCard, type CardDetails } from '@/shared/payments';
import { Alert, Badge, Button, Card, CardTitle, Field, Input } from '@/shared/ui';

const f = es.checkoutForms;

const CardSchema = z.object({
  number: cardNumberField,
  holder: z.string().trim().min(1, es.validation.required),
  expiry: cardExpiryField,
  cvv: cvvField,
});

const EMPTY: CardDetails = { number: '', holder: '', expiry: '', cvv: '' };

/** "0828" o "08/28" → "08/28" mientras se escribe. */
function maskExpiry(raw: string): string {
  const digits = onlyDigits(raw).slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

interface PaymentFormProps {
  amount: Money;
  /** Hay un pago en curso: el botón queda deshabilitado. */
  busy: boolean;
  onPay: (paymentReference: string) => void;
}

/**
 * Formulario PROVISIONAL de pago (F4a; F4b lo reemplaza). La tarjeta va solo a `payments`
 * (shared/payments), que devuelve la referencia; nunca se guarda ni se envía a la API de vuelos.
 * El formulario se vacía apenas se usa la tarjeta.
 */
export function PaymentForm({ amount, busy, onPay }: PaymentFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CardDetails>({ resolver: zodResolver(CardSchema), defaultValues: EMPTY, mode: 'onTouched', shouldFocusError: true });

  const sending = useRef(false);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending.current || busy) return;
    sending.current = true;
    void handleSubmit(async (values) => {
      const card = { ...values };
      try {
        const { reference } = await payments.authorize(card, amount);
        onPay(reference);
      } finally {
        wipeCard(card);
        reset(EMPTY);
      }
    })(event).finally(() => {
      sending.current = false;
    });
  };

  const showTestCards = apiConfig.usingMock || import.meta.env.DEV;

  return (
    <Card className="flex flex-col gap-4">
      <CardTitle className="flex flex-wrap items-center gap-2">
        <CreditCard aria-hidden="true" className="size-6 text-primary" />
        {es.purchase.steps.payment}
        {payments.simulated ? <Badge tone="warning">{f.simulatedTitle}</Badge> : null}
      </CardTitle>
      {payments.simulated ? (
        <Alert variant="info" title={f.simulatedTitle}>
          <p>{f.simulatedText}</p>
        </Alert>
      ) : null}
      {showTestCards ? (
        <div className="rounded border-2 border-dashed border-border p-4">
          <p className="font-bold">{f.testCardsTitle}</p>
          <ul className="flex flex-col gap-1 tabular-nums">
            <li>{fmt(f.testCardApproved, { number: TEST_CARDS.approved })}</li>
            <li>{fmt(f.testCardDeclined, { number: TEST_CARDS.declined })}</li>
            <li>{fmt(f.testCardPending, { number: TEST_CARDS.pending })}</li>
          </ul>
          <p className="text-sm text-muted">{f.testCardsNote}</p>
        </div>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" autoComplete="on">
        <Field id="card-number" label={f.cardNumber} hint={f.cardNumberHint} error={errors.number?.message} required className="sm:col-span-2">
          <Input inputMode="numeric" autoComplete="cc-number" {...register('number', { onChange: (e) => setValue('number', onlyDigits(e.target.value).slice(0, 19)) })} />
        </Field>
        <Field id="card-holder" label={f.cardHolder} error={errors.holder?.message} required className="sm:col-span-2">
          <Input autoComplete="cc-name" {...register('holder')} />
        </Field>
        <Field id="card-expiry" label={f.cardExpiry} hint={f.cardExpiryHint} error={errors.expiry?.message} required>
          <Input inputMode="numeric" autoComplete="cc-exp" {...register('expiry', { onChange: (e) => setValue('expiry', maskExpiry(e.target.value)) })} />
        </Field>
        <Field id="card-cvv" label={f.cvv} hint={f.cvvHint} error={errors.cvv?.message} required>
          <Input inputMode="numeric" autoComplete="cc-csc" type="password" {...register('cvv', { onChange: (e) => setValue('cvv', onlyDigits(e.target.value).slice(0, 4)) })} />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" size="lg" loading={busy} disabled={busy}>
            {busy ? f.paying : fmt(f.pay, { total: formatMoney(amount) })}
          </Button>
        </div>
      </form>
    </Card>
  );
}
