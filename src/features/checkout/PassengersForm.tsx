import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import type { BookingPassenger, FieldError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { countries, isBookableCountry } from '@/shared/lib/countries';
import { maskDateInput } from '@/shared/lib/dates';
import { onlyDigits, onlyLetters } from '@/shared/lib/validators';
import { Button, Checkbox, Field, FormStatus, Input, Select } from '@/shared/ui';
import {
  initialPassengerValues,
  isEcuadorianId,
  passengerIdAt,
  passengersSchema,
  passengerTypes,
  sanitizeDocument,
  toBookingPassengers,
  tripDates,
  withSharedContact,
  type PassengersFormValues,
  type SeatChoice,
  type ToAssignedSeats,
} from './passengers';
import { apiFieldToForm } from './passengerFields';
import { seatLines } from './seatLines';
import { SeatsBlock } from './SeatsBlock';
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
  ['gender', 'gender', f.gender],
  ['birthDate', 'birth', f.birthDate],
  ['documentExpiryDate', 'exp', f.documentExpiry],
  ['adultIndex', 'adult', f.infantWho],
  ['email', 'email', f.email],
  ['phone', 'phone', f.phone],
] as const;

/** Un campo sin nada escrito (o sin opción elegida). */
const isEmpty = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/**
 * Qué falta y qué hay que revisar, a partir de las mismas reglas con las que se valida (zod). Con un solo pasajero se
 * nombra el campo ("fecha de nacimiento"); con varios se agrega de quién ("fecha de nacimiento (adulto 2)").
 */
function pendingFields(issues: readonly { path: readonly (string | number)[] }[], values: PassengersFormValues, types: readonly PassengersFormValues['passengers'][number]['type'][]) {
  const missing: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const { path } of issues) {
    const [root, index, name] = path;
    const field = FIELDS.find(([key]) => key === name);
    if (root !== 'passengers' || typeof index !== 'number' || !field) {
      if (!seen.has('other')) invalid.push(f.otherData);
      seen.add('other');
      continue;
    }
    const key = `${index}.${field[0]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const who = types.length > 1 ? ` (${TYPE_LABEL[types[index]].toLowerCase()} ${types.slice(0, index + 1).filter((t) => t === types[index]).length})` : '';
    const label = `${field[2].toLowerCase()}${who}`;
    (isEmpty(values.passengers?.[index]?.[field[0]]) ? missing : invalid).push(label);
  }
  return { missing, invalid };
}

/**
 * Elegir asientos (opcional). El selector vive en `features/seats` y un módulo de `features` no
 * importa de otro: la página lo pone aquí. El formulario solo guarda lo elegido y lo convierte a
 * `assignedSeats` por tramo con la conversión del selector (`toAssignedSeats`).
 */
export interface SeatsSlot {
  /** Ids de los tramos del viaje (`segmentId`): lo que un borrador de otro vuelo ya no sirve. */
  segmentIds: string[];
  toAssigned: ToAssignedSeats;
  /** Abrir el bloque (p. ej. tras un 409 de asiento ocupado). */
  forceOpen?: boolean;
  render: (api: { passengers: { id: string; name: string; type: PassengersFormValues['passengers'][number]['type'] }[]; value: SeatChoice; onChange: (next: SeatChoice) => void }) => ReactNode;
}

interface PassengersFormProps {
  selection: CheckoutSelection;
  seats?: SeatsSlot;
  draft: BookingPassenger[];
  accountEmail?: string;
  /** Campos que la API rechazó al pagar (p. ej. "passengers[0].birthDate"). */
  rejected: FieldError[];
  /** Cada cambio (con una pausa corta) y al salir: el borrador sobrevive a refrescar y a un hold vencido. */
  onDraft: (passengers: BookingPassenger[]) => void;
  onDone: (passengers: BookingPassenger[]) => void;
}

/**
 * Un bloque (fieldset) por pasajero con los campos de PassengerItem del contrato. Valida en tiempo real sin borrar lo
 * escrito: el error de un campo aparece al salir de él y se va solo al corregirlo; los nombres no admiten números ni signos
 * y la fecha no deja escribir un mes 13. «Continuar» se activa cuando no falta nada y el estado junto al botón dice qué
 * falta (no hay resumen de errores). El correo de la cuenta precarga el contacto del primer pasajero.
 */
export function PassengersForm({ selection, seats, draft, accountEmail, rejected, onDraft, onDone }: PassengersFormProps) {
  const types = useMemo(() => passengerTypes(selection.passengers), [selection.passengers]);
  const schema = useMemo(() => passengersSchema(tripDates(selection)), [selection]);
  const resolver = useMemo<Resolver<PassengersFormValues>>(() => (values, context, options) => zodResolver(schema)(withSharedContact(values), context, options), [schema]);
  const list = useMemo(() => countries(), []);
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
    defaultValues: initialPassengerValues(types, draft, accountEmail, seats?.segmentIds),
    mode: 'onTouched',
    shouldFocusError: true,
  });
  const values = useWatch({ control }) as PassengersFormValues;

  // Borrador: con una pausa corta tras escribir, y al salir de la pantalla (salvo al continuar).
  const latest = useRef(values);
  latest.current = values;
  const toAssignedRef = useRef(seats?.toAssigned);
  toAssignedRef.current = seats?.toAssigned;
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;
  const signature = JSON.stringify(values);
  useEffect(() => {
    const id = setTimeout(() => {
      if (!submitted.current) onDraftRef.current(toBookingPassengers(latest.current, toAssignedRef.current));
    }, DRAFT_DELAY_MS);
    return () => clearTimeout(id);
  }, [signature]);
  useEffect(
    () => () => {
      if (!submitted.current) onDraftRef.current(toBookingPassengers(latest.current, toAssignedRef.current));
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

  // Qué falta, en vivo: el botón de continuar se activa cuando ya no queda nada pendiente.
  const parsed = schema.safeParse(withSharedContact(values));
  const pending = parsed.success ? { missing: [], invalid: [] } : pendingFields(parsed.error.issues, values, types);
  const ready = parsed.success;
  const adults = types.flatMap((t, i) => (t === 'ADULT' ? [i] : []));
  // Lo que lleva cada pasajero en cada tramo (para el bloque de asientos y la línea de cada pasajero).
  const draftPassengers = toBookingPassengers(values, seats?.toAssigned);
  const lines = seatLines(draftPassengers, selection.outbound, selection.inbound);
  const nameOf = (i: number) => [values?.passengers?.[i]?.firstName, values?.passengers?.[i]?.lastName].filter(Boolean).join(' ');

  /** "Adulto 1", "Adulto 2", "Niño 1", "Infante 1": se numera por tipo. */
  const ordinal = (i: number) => types.slice(0, i + 1).filter((t) => t === types[i]).length;
  return (
    <form
      noValidate
      aria-label={es.purchase.passengersTitle}
      onSubmit={(e) =>
        void handleSubmit((v) => {
          submitted.current = true;
          onDone(toBookingPassengers(v, seats?.toAssigned));
        })(e)
      }
      className="flex flex-col gap-6"
    >
      {types.map((type, i) => {
        const id = (suffix: string) => `pax${i}-${suffix}`;
        const own = errors.passengers?.[i];
        const current = values?.passengers?.[i];
        const passport = current?.documentType === 'PASSPORT';
        const showContact = i === 0 || !values?.sameContact;
        return (
          <fieldset key={id('set')} className="flex flex-col gap-4 rounded border-2 border-border bg-surface p-6 shadow-card">
            <legend className="px-2 text-xl font-bold">{fmt(f.passengerTitle, { type: TYPE_LABEL[type], number: ordinal(i) })}</legend>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field id={id('first')} label={f.firstName} error={own?.firstName?.message} required>
                <Input autoComplete={i === 0 ? 'given-name' : 'off'} maxLength={60} {...register(`passengers.${i}.firstName`, { onChange: (e) => setValue(`passengers.${i}.firstName`, onlyLetters(e.target.value)) })} />
              </Field>
              <Field id={id('last')} label={f.lastName} error={own?.lastName?.message} required>
                <Input autoComplete={i === 0 ? 'family-name' : 'off'} maxLength={60} {...register(`passengers.${i}.lastName`, { onChange: (e) => setValue(`passengers.${i}.lastName`, onlyLetters(e.target.value)) })} />
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
              <Field id={id('birth')} label={f.birthDate} hint={`${f.dateHint} ${es.checkoutForms.birthRule[type]}`} error={own?.birthDate?.message} required>
                <Input
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'bday' : 'off'}
                  maxLength={10}
                  {...register(`passengers.${i}.birthDate`, { onChange: (e) => setValue(`passengers.${i}.birthDate`, maskDateInput(e.target.value)) })}
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
              <div className="grid items-start gap-4 border-t-2 border-border pt-4 sm:grid-cols-2">
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
                <span className="font-bold text-foreground">{f.seat}:</span> {lines[i]?.text}
              </p>
            )}
          </fieldset>
        );
      })}

      {seats ? (
        <SeatsBlock lines={lines} forceOpen={seats.forceOpen}>
          {seats.render({
            passengers: types.map((type, i) => ({ id: passengerIdAt(i), type, name: nameOf(i) || `${TYPE_LABEL[type]} ${ordinal(i)}` })),
            value: values?.seats ?? {},
            onChange: (next) => setValue('seats', next, { shouldDirty: true }),
          })}
        </SeatsBlock>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <FormStatus id="passengers-status" ready={ready} missing={pending.missing} invalid={pending.invalid} className="min-w-0 flex-1 basis-60" />
        <Button type="submit" size="lg" disabled={!ready} aria-describedby="passengers-status">
          {f.saveAndContinue}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}
