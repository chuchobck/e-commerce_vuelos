import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { BookingPassenger, FieldError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { maskDateInput } from '@/shared/lib/dates';
import { Button, Card, CardTitle, Field, Input, Select } from '@/shared/ui';
import { initialPassengerValues, passengersSchema, passengerTypes, toBookingPassengers, tripDates, type PassengersFormValues } from './passengers';
import type { CheckoutSelection } from './selection';

const f = es.checkoutForms;
const TYPE_LABEL = { ADULT: es.trip.typeADULT, YOUTH: es.trip.typeYOUTH, CHILD: es.trip.typeCHILD, INFANT: es.trip.typeINFANT } as const;

interface PassengersFormProps {
  selection: CheckoutSelection;
  draft: BookingPassenger[];
  accountEmail?: string;
  /** Campos que la API rechazó al pagar (p. ej. "passengers[0].birthDate"). */
  rejected: FieldError[];
  onDone: (passengers: BookingPassenger[]) => void;
}

/**
 * Formulario PROVISIONAL de pasajeros (F4a): un bloque por pasajero y un contacto común.
 * F4b lo reemplaza con el diseño final; las reglas (passengers.ts) se quedan.
 */
export function PassengersForm({ selection, draft, accountEmail, rejected, onDone }: PassengersFormProps) {
  const types = useMemo(() => passengerTypes(selection.passengers), [selection.passengers]);
  const schema = useMemo(() => passengersSchema(tripDates(selection)), [selection]);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<PassengersFormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialPassengerValues(types, draft, accountEmail),
    mode: 'onTouched',
    shouldFocusError: true,
  });
  const values = useWatch({ control, name: 'passengers' });

  // Lo que la API rechazó al pagar se marca en su campo.
  useEffect(() => {
    for (const { field } of rejected) {
      const match = /^passengers\[(\d+)\]\.(\w+)/.exec(field);
      if (match) setError(`passengers.${Number(match[1])}.${match[2]}` as `passengers.0.firstName`, { message: es.purchaseErrors.fieldRejected }, { shouldFocus: true });
    }
  }, [rejected, setError]);

  let adultNumber = 0;
  return (
    <form noValidate onSubmit={(e) => void handleSubmit((v) => onDone(toBookingPassengers(v)))(e)} className="flex flex-col gap-6">
      {types.map((type, i) => {
        const id = (name: string) => `pax${i}-${name}`;
        const err = errors.passengers?.[i];
        const infantOf = type === 'INFANT' ? ++adultNumber : 0;
        const passport = values?.[i]?.documentType === 'PASSPORT';
        return (
          <Card key={id('card')} className="flex flex-col gap-4">
            <CardTitle>{fmt(f.passengerTitle, { type: TYPE_LABEL[type], number: i + 1 })}</CardTitle>
            {infantOf ? <p className="text-muted">{fmt(f.infantWith, { adult: `${TYPE_LABEL.ADULT} ${infantOf}` })}</p> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={id('first')} label={f.firstName} error={err?.firstName?.message} required>
                <Input autoComplete={i === 0 ? 'given-name' : 'off'} {...register(`passengers.${i}.firstName`)} />
              </Field>
              <Field id={id('last')} label={f.lastName} error={err?.lastName?.message} required>
                <Input autoComplete={i === 0 ? 'family-name' : 'off'} {...register(`passengers.${i}.lastName`)} />
              </Field>
              <Field id={id('doctype')} label={f.documentType} required>
                <Select
                  options={[
                    { value: 'NATIONAL_ID', label: es.documents.cedula },
                    { value: 'PASSPORT', label: es.documents.passport },
                  ]}
                  {...register(`passengers.${i}.documentType`)}
                />
              </Field>
              <Field id={id('doc')} label={f.documentNumber} hint={passport ? es.documents.passportHint : es.documents.cedulaHint} error={err?.documentNumber?.message} required>
                <Input autoComplete="off" {...register(`passengers.${i}.documentNumber`)} />
              </Field>
              <Field id={id('nat')} label={f.nationality} hint={f.nationalityHint} error={err?.nationality?.message} required>
                <Input autoComplete="off" maxLength={2} className="uppercase" {...register(`passengers.${i}.nationality`)} />
              </Field>
              {passport ? (
                <Field id={id('exp')} label={f.documentExpiry} hint={f.dateHint} error={err?.documentExpiryDate?.message} required>
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    {...register(`passengers.${i}.documentExpiryDate`, { onChange: (e) => setValue(`passengers.${i}.documentExpiryDate`, maskDateInput(e.target.value)) })}
                  />
                </Field>
              ) : null}
              <Field id={id('birth')} label={f.birthDate} hint={f.dateHint} error={err?.birthDate?.message} required>
                <Input
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'bday' : 'off'}
                  {...register(`passengers.${i}.birthDate`, { onChange: (e) => setValue(`passengers.${i}.birthDate`, maskDateInput(e.target.value)) })}
                />
              </Field>
              <Field id={id('gender')} label={f.gender} error={err?.gender?.message} required>
                <Select
                  placeholder={f.genderChoose}
                  options={[
                    { value: 'F', label: f.genderF },
                    { value: 'M', label: f.genderM },
                    { value: 'X', label: f.genderX },
                  ]}
                  {...register(`passengers.${i}.gender`)}
                />
              </Field>
            </div>
          </Card>
        );
      })}

      <Card className="flex flex-col gap-4">
        <CardTitle>{f.contactTitle}</CardTitle>
        <p className="text-muted">{f.contactText}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="contact-email" label={f.email} error={errors.email?.message} required>
            <Input type="email" autoComplete="email" {...register('email')} />
          </Field>
          <Field id="contact-phone" label={f.phone} hint={f.phoneHint} error={errors.phone?.message} required>
            <Input inputMode="numeric" autoComplete="tel-national" prefix="+593" maxLength={9} {...register('phone')} />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg">
          {f.saveAndContinue}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
