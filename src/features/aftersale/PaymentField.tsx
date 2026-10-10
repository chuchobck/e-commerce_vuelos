import { useState } from 'react';
import { es } from '@/shared/i18n';
import { Button, Field, Input, MockOnly } from '@/shared/ui';
import { isPaymentReference, newPaymentReference } from './paymentReference';

const t = es.aftersale.payment;

interface PaymentFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Pago simulado de la postventa: una referencia de la Payment API simulada (`PAY-OK-…` aprobado, `PAY-PEND-…` pendiente,
 * `PAY-REJ-…` rechazado). Viene llena con una aprobada y nueva (camino feliz sin escribir nada); se puede cambiar. Los
 * botones de prueba solo se ven con el mock. Valida en vivo: el error sale al salir del campo y se va al corregirlo; quien
 * la usa deshabilita el botón de pagar mientras `isPaymentReference(value)` sea falso.
 */
export function PaymentField({ id, value, onChange }: PaymentFieldProps) {
  const [touched, setTouched] = useState(false);
  const error = touched && !isPaymentReference(value) ? t.invalid : undefined;
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-xl font-bold">{t.legend}</legend>
      <Field id={id} label={t.label} hint={t.hint} error={error} required>
        <Input value={value} onChange={(e) => onChange(e.target.value.toUpperCase().replace(/\s+/g, ''))} onBlur={() => setTouched(true)} autoComplete="off" spellCheck={false} maxLength={64} />
      </Field>
      <MockOnly>
        <div className="flex flex-col gap-2 rounded border-2 border-dashed border-input p-4">
          <p className="font-bold">{t.testTitle}</p>
          <p className="text-sm text-muted">{t.testText}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => onChange(newPaymentReference('OK'))}>
              {t.newOk}
            </Button>
            <Button variant="secondary" onClick={() => onChange(newPaymentReference('PEND'))}>
              {t.newPend}
            </Button>
            <Button variant="secondary" onClick={() => onChange(newPaymentReference('REJ'))}>
              {t.newRej}
            </Button>
          </div>
        </div>
      </MockOnly>
    </fieldset>
  );
}
