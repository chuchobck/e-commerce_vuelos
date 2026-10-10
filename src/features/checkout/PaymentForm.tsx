import { zodResolver } from '@hookform/resolvers/zod';
import { CreditCard } from 'lucide-react';
import { useRef, type FormEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { apiConfig, type Money } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatMoney } from '@/shared/lib/format';
import { cardExpiryField, cardNumberField, cvvField } from '@/shared/lib/schemas';
import { onlyDigits, onlyLetters } from '@/shared/lib/validators';
import { payments, TEST_CARDS, wipeCard, type CardDetails } from '@/shared/payments';
import { Alert, Badge, Button, Card, CardTitle, Field, FormStatus, Input } from '@/shared/ui';

const f = es.checkoutForms;

const CardSchema = z.object({
  number: z.string().transform(onlyDigits).pipe(cardNumberField),
  holder: z.string().trim().min(1, es.validation.required),
  expiry: cardExpiryField,
  cvv: cvvField,
});
type CardInput = z.input<typeof CardSchema>;

const EMPTY: CardInput = { number: '', holder: '', expiry: '', cvv: '' };

/** "4111111111111111" → "4111 1111 1111 1111": solo se ve así; en el estado van los dígitos. */
export function formatCardNumber(raw: string): string {
  return onlyDigits(raw).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** "0828" o "08/28" → "08/28" mientras se escribe. */
function maskExpiry(raw: string): string {
  const digits = onlyDigits(raw).slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

const CARD_LABELS = { number: f.cardNumber, holder: f.cardHolder, expiry: f.cardExpiry, cvv: f.cvv } as const;

/** Qué falta (campos vacíos) y qué hay que revisar (algo escrito que no sirve), con las mismas reglas que valida el formulario. */
function pendingCardFields(values: Partial<CardInput>) {
  const parsed = CardSchema.safeParse({ ...EMPTY, ...values });
  const missing: string[] = [];
  const invalid: string[] = [];
  if (!parsed.success) {
    for (const key of new Set(parsed.error.issues.map((i) => i.path[0]))) {
      if (typeof key !== 'string' || !(key in CARD_LABELS)) continue;
      const name = key as keyof typeof CARD_LABELS;
      (values[name]?.trim() ? invalid : missing).push(CARD_LABELS[name].toLowerCase());
    }
  }
  return { ready: parsed.success, missing, invalid };
}

interface PaymentFormProps {
  amount: Money;
  /** Hay un pago en curso: el botón queda deshabilitado. */
  busy: boolean;
  onPay: (paymentReference: string) => void;
}

/**
 * Tarjeta del pago simulado. La tarjeta va solo a `payments` (shared/payments), que devuelve la
 * referencia; nunca se guarda, no se registra ni se envía a la API de vuelos. El formulario se
 * vacía apenas se usa la tarjeta (también tras un rechazo: se escribe otra). Se valida en vivo: «Pagar» se activa cuando
 * los cuatro datos están completos y bien, y el estado junto al botón dice qué falta (sin resumen de errores). El titular
 * solo admite letras y espacios.
 */
export function PaymentForm({ amount, busy, onPay }: PaymentFormProps) {
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CardInput, unknown, CardDetails>({ resolver: zodResolver(CardSchema), defaultValues: EMPTY, mode: 'onTouched', shouldFocusError: true });
  const { ready, missing, invalid } = pendingCardFields(useWatch({ control }));

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
        {f.cardTitle}
        {payments.simulated ? <Badge tone="warning">{f.simulatedTitle}</Badge> : null}
      </CardTitle>
      {payments.simulated ? (
        <Alert variant="info" title={f.simulatedBanner}>
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
      <form noValidate onSubmit={onSubmit} aria-label={f.cardTitle} className="grid items-start gap-4 sm:grid-cols-2" autoComplete="on">
        <Field id="card-number" label={f.cardNumber} hint={f.cardNumberHint} error={errors.number?.message} required className="sm:col-span-2">
          <Input
            inputMode="numeric"
            autoComplete="cc-number"
            maxLength={23}
            {...register('number', { onChange: (e) => setValue('number', formatCardNumber(e.target.value)) })}
          />
        </Field>
        <Field id="card-holder" label={f.cardHolder} error={errors.holder?.message} required className="sm:col-span-2">
          <Input
            autoComplete="cc-name"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={60}
            className="uppercase"
            {...register('holder', { onChange: (e) => setValue('holder', onlyLetters(e.target.value)) })}
          />
        </Field>
        <Field id="card-expiry" label={f.cardExpiry} hint={f.cardExpiryHint} error={errors.expiry?.message} required>
          <Input inputMode="numeric" autoComplete="cc-exp" maxLength={5} {...register('expiry', { onChange: (e) => setValue('expiry', maskExpiry(e.target.value)) })} />
        </Field>
        <Field id="card-cvv" label={f.cvv} hint={f.cvvHint} error={errors.cvv?.message} required>
          <Input inputMode="numeric" autoComplete="cc-csc" type="password" maxLength={4} {...register('cvv', { onChange: (e) => setValue('cvv', onlyDigits(e.target.value).slice(0, 4)) })} />
        </Field>
        <div className="flex flex-col gap-3 sm:col-span-2">
          <Button type="submit" size="lg" loading={busy} disabled={busy || !ready} aria-describedby="card-status" fullWidth className="sm:w-auto sm:self-start">
            {busy ? f.paying : fmt(f.pay, { total: formatMoney(amount) })}
          </Button>
          <FormStatus id="card-status" ready={ready} missing={missing} invalid={invalid} readyText={f.cardReady} />
        </div>
      </form>
    </Card>
  );
}
