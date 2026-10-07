import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch, type FieldErrors, type Resolver } from 'react-hook-form';
import type { BookingPassenger, FieldError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { countries, isBookableCountry } from '@/shared/lib/countries';
import { maskDateInput } from '@/shared/lib/dates';
import { onlyDigits } from '@/shared/lib/validators';
import { Button, Checkbox, ErrorSummary, Field, Input, Select, type SummaryError } from '@/shared/ui';
import {
  initialPassengerValues,
  isEcuadorianId,
  passengersSchema,
  passengerTypes,
  sanitizeDocument,
  toBookingPassengers,
  tripDates,
  withSharedContact,
  type PassengersFormValues,
} from './passengers';
import { apiFieldToForm } from './passengerFields';
import type { CheckoutSelection } from './selection';

const f = es.checkoutForms;
const TYPE_LABEL = { ADULT: es.trip.typeADULT, YOUTH: es.trip.typeYOUTH, CHILD: es.trip.typeCHILD, INFANT: es.trip.typeINFANT } as const;
const DRAFT_DELAY_MS = 400;

/** Campos del formulario en el orden de la pantalla: nombre en el formulario, sufijo del id y etiqueta. */
const FIELDS = [
  ['firstName', 'first', f.firstName],
  ['lastName', 'last', f.lastName],
  ['documentType', 'doctype', f.documentType],
  ['documentNumber', 'doc', f.documentNumber],
  ['nationality', 'nat', f.nationality],
  ['documentExpiryDate', 'exp', f.documentExpiry],
  ['birthDate', 'birth', f.birthDate],
  ['gender', 'gender', f.gender],
  ['adultIndex', 'adult', f.infantWho],
  ['email', 'email', f.email],
  ['phone', 'phone', f.phone],
] as const;

function summaryOf(errors: FieldErrors<PassengersFormValues>, count: number): SummaryError[] {
  const out: SummaryError[] = [];
  for (let i = 0; i < count; i++) {
    const own = errors.passengers?.[i];
    if (!own) continue;
    for (const [name, suffix, label] of FIELDS) {
      const message = own[name]?.message;
      if (typeof message === 'string') out.push({ fieldId: `pax${i}-${suffix}`, label: `${fmt(f.passengerShort, { number: i + 1 })} · ${label}`, message });
    }
  }
  return out;
}

interface PassengersFormProps {
  selection: CheckoutSelection;
  draft: BookingPassenger[];
  accountEmail?: string;
  /** Campos que la API rechazó al pagar (p. ej. "passengers[0].birthDate"). */
  rejected: FieldError[];
  /** Cada cambio (con una pausa corta) y al salir: el borrador sobrevive a refrescar y a un hold vencido. */
  onDraft: (passengers: BookingPassenger[]) => void;
  onDone: (passengers: BookingPassenger[]) => void;
}

/**
 * Un bloque (fieldset) por pasajero con los campos de PassengerItem del contrato. Valida al salir
 * del campo y al enviar, sin borrar lo escrito: errores bajo cada campo, resumen al inicio y foco al
 * primer campo con error. El correo de la cuenta precarga el contacto del primer pasajero.
 */
export function PassengersForm({ selection, draft, accountEmail, rejected, onDraft, onDone }: PassengersFormProps) {
  const types = useMemo(() => passengerTypes(selection.passengers), [selection.passengers]);
  const schema = useMemo(() => passengersSchema(tripDates(selection)), [selection]);
  const resolver = useMemo<Resolver<PassengersFormValues>>(() => (values, context, options) => zodResolver(schema)(withSharedContact(values), context, options), [schema]);
  const list = useMemo(() => countries(), []);
  const [attempts, setAttempts] = useState(0);
  const submitted = useRef(false);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<PassengersFormValues>({
    resolver,
    defaultValues: initialPassengerValues(types, draft, accountEmail),
    mode: 'onTouched',
    shouldFocusError: true,
  });
  const values = useWatch({ control }) as PassengersFormValues;

  // Borrador: con una pausa corta tras escribir, y al salir de la pantalla (salvo al continuar).
  const latest = useRef(values);
  latest.current = values;
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;
  const signature = JSON.stringify(values);
  useEffect(() => {
    const id = setTimeout(() => {
      if (!submitted.current) onDraftRef.current(toBookingPassengers(latest.current));
    }, DRAFT_DELAY_MS);
    return () => clearTimeout(id);
  }, [signature]);
  useEffect(
    () => () => {
      if (!submitted.current) onDraftRef.current(toBookingPassengers(latest.current));
    },
    [],
  );

  // Lo que la API rechazó al pagar se marca en su campo.
  useEffect(() => {
    for (const { field } of rejected) {
      const target = apiFieldToForm(field);
      if (target) setError(`passengers.${target.index}.${target.name}` as `passengers.0.firstName`, { message: es.purchaseErrors.fieldRejected }, { shouldFocus: true });
    }
  }, [rejected, setError]);

  const summary = attempts > 0 ? summaryOf(errors, types.length) : [];
  const adults = types.flatMap((t, i) => (t === 'ADULT' ? [i] : []));
  const nameOf = (i: number) => [values?.passengers?.[i]?.firstName, values?.passengers?.[i]?.lastName].filter(Boolean).join(' ');

  /** "Adulto 1", "Adulto 2", "Niño 1", "Infante 1": se numera por tipo. */
  const ordinal = (i: number) => types.slice(0, i + 1).filter((t) => t === types[i]).length;
  return (
    <form
      noValidate
      aria-label={es.purchase.passengersTitle}
      onSubmit={(e) =>
        void handleSubmit(
          (v) => {
            submitted.current = true;
            onDone(toBookingPassengers(v));
          },
          () => setAttempts((n) => n + 1),
        )(e)
      }
      className="flex flex-col gap-6"
    >
      <ErrorSummary errors={summary} />
      {types.map((type, i) => {
        const id = (suffix: string) => `pax${i}-${suffix}`;
        const own = errors.passengers?.[i];
        const current = values?.passengers?.[i];
        const passport = current?.documentType === 'PASSPORT';
        const showContact = i === 0 || !values?.sameContact;
        return (
          <fieldset key={id('set')} className="flex flex-col gap-4 rounded border-2 border-border bg-surface p-6 shadow-card">
            <legend className="px-2 text-xl font-bold">{fmt(f.passengerTitle, { type: TYPE_LABEL[type], number: ordinal(i) })}</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={id('first')} label={f.firstName} error={own?.firstName?.message} required>
                <Input autoComplete={i === 0 ? 'given-name' : 'off'} maxLength={60} {...register(`passengers.${i}.firstName`)} />
              </Field>
              <Field id={id('last')} label={f.lastName} error={own?.lastName?.message} required>
                <Input autoComplete={i === 0 ? 'family-name' : 'off'} maxLength={60} {...register(`passengers.${i}.lastName`)} />
              </Field>
              <Field id={id('doctype')} label={f.documentType} required>
                <Select
                  options={[
                    { value: 'NATIONAL_ID', label: es.documents.cedula },
                    { value: 'PASSPORT', label: es.documents.passport },
                  ]}
                  {...register(`passengers.${i}.documentType`, {
                    onChange: (e) => setValue(`passengers.${i}.documentNumber`, sanitizeDocument({ documentType: e.target.value, nationality: current?.nationality ?? 'EC' }, current?.documentNumber ?? '')),
                  })}
                />
              </Field>
              <Field id={id('doc')} label={f.documentNumber} hint={current && isEcuadorianId(current) ? es.documents.cedulaHint : es.documents.passportHint} error={own?.documentNumber?.message} required>
                <Input
                  autoComplete="off"
                  inputMode={current && isEcuadorianId(current) ? 'numeric' : 'text'}
                  maxLength={current && isEcuadorianId(current) ? 10 : 20}
                  {...register(`passengers.${i}.documentNumber`, { onChange: (e) => setValue(`passengers.${i}.documentNumber`, sanitizeDocument(current ?? { documentType: 'NATIONAL_ID', nationality: 'EC' }, e.target.value)) })}
                />
              </Field>
              <Field id={id('nat')} label={f.nationality} error={own?.nationality?.message} required>
                <Select
                  options={list.map((c) => ({ value: c.code, label: isBookableCountry(c.code) ? c.name : fmt(f.countryUnavailable, { country: c.name }), disabled: !isBookableCountry(c.code) }))}
                  autoComplete="country"
                  {...register(`passengers.${i}.nationality`, {
                    onChange: (e) => setValue(`passengers.${i}.documentNumber`, sanitizeDocument({ documentType: current?.documentType ?? 'NATIONAL_ID', nationality: e.target.value }, current?.documentNumber ?? '')),
                  })}
                />
              </Field>
              {passport ? (
                <Field id={id('exp')} label={f.documentExpiry} hint={f.dateHint} error={own?.documentExpiryDate?.message} required>
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={10}
                    {...register(`passengers.${i}.documentExpiryDate`, { onChange: (e) => setValue(`passengers.${i}.documentExpiryDate`, maskDateInput(e.target.value)) })}
                  />
                </Field>
              ) : null}
              <Field id={id('birth')} label={f.birthDate} hint={`${f.dateHint} ${es.checkoutForms.birthRule[type]}`} error={own?.birthDate?.message} required>
                <Input
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'bday' : 'off'}
                  maxLength={10}
                  {...register(`passengers.${i}.birthDate`, { onChange: (e) => setValue(`passengers.${i}.birthDate`, maskDateInput(e.target.value)) })}
                />
              </Field>
              <Field id={id('gender')} label={f.gender} error={own?.gender?.message} required>
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
              {type === 'INFANT' ? (
                <Field id={id('adult')} label={f.infantWho} hint={f.infantHint} error={own?.adultIndex?.message} required className="sm:col-span-2">
                  <Select
                    placeholder={f.genderChoose}
                    options={adults.map((a, n) => ({ value: String(a), label: `${fmt(f.passengerTitle, { type: TYPE_LABEL.ADULT, number: n + 1 })}${nameOf(a) ? ` · ${nameOf(a)}` : ''}` }))}
                    {...register(`passengers.${i}.adultIndex`)}
                  />
                </Field>
              ) : null}
            </div>

            {showContact ? (
              <div className="grid gap-4 border-t-2 border-border pt-4 sm:grid-cols-2">
                <p className="font-bold sm:col-span-2">{i === 0 && types.length > 1 ? f.contactMain : f.contactTitle}</p>
                <Field id={id('email')} label={f.email} error={own?.email?.message} required>
                  <Input type="email" autoComplete={i === 0 ? 'email' : 'off'} inputMode="email" spellCheck={false} autoCapitalize="none" {...register(`passengers.${i}.email`)} />
                </Field>
                <Field id={id('phone')} label={f.phone} hint={f.phoneHint} error={own?.phone?.message} required>
                  <Input
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'tel-national' : 'off'}
                    prefix="+593"
                    maxLength={9}
                    {...register(`passengers.${i}.phone`, { onChange: (e) => setValue(`passengers.${i}.phone`, onlyDigits(e.target.value).slice(0, 9)) })}
                  />
                </Field>
                {i === 0 && types.length > 1 ? (
                  <Controller
                    control={control}
                    name="sameContact"
                    render={({ field }) => (
                      <Checkbox
                        id="same-contact"
                        ref={field.ref}
                        label={f.sameContact}
                        hint={f.sameContactHint}
                        checked={field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                        className="sm:col-span-2"
                      />
                    )}
                  />
                ) : null}
              </div>
            ) : null}

            {type === 'INFANT' ? (
              <p className="text-sm text-muted">{f.infantNoSeat}</p>
            ) : (
              <p className="text-sm text-muted">
                <span className="font-bold text-foreground">{f.seat}:</span> {f.seatAuto} <span>{f.seatSoon}</span>
              </p>
            )}
          </fieldset>
        );
      })}

      <div className="flex justify-end">
        <Button type="submit" size="lg">
          {f.saveAndContinue}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
