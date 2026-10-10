import { zodResolver } from '@hookform/resolvers/zod';
import * as Popover from '@radix-ui/react-popover';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { ArrowLeftRight, CheckCircle2, ChevronDown, Info, MapPin, PlaneLanding, PlaneTakeoff, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { routes } from '@/app/routes';
import { AIRPORTS, cityOf, findAirport, hasFlights } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { lastFlightDate, parseDisplayDate, today } from '@/shared/lib/dates';
import { joinList } from '@/shared/lib/joinList';
import { Button, CompactField, Combobox, DatePicker, FieldError, QuantityInput, RadioGroup, type ComboboxOption } from '@/shared/ui';
import { formToQuery, queryToForm } from './searchQuery';
import { MAX_PASSENGERS, SEARCH_DEFAULTS, SearchFormSchema, type SearchFormInput, type TripType } from './searchSchema';

const s = es.search;

/** ids estables: el bloque de errores enlaza a ellos. Los pasajeros comparten el botón que abre su panel. */
const IDS = {
  tripType: 'search-trip',
  origin: 'search-origin',
  destination: 'search-destination',
  departDate: 'search-depart',
  returnDate: 'search-return',
  adults: 'search-passengers',
  children: 'search-passengers',
  infants: 'search-passengers',
  cabin: 'search-passengers',
} as const satisfies Record<keyof SearchFormInput, string>;

const LABELS: Record<'origin' | 'destination' | 'departDate' | 'returnDate', string> = {
  origin: s.origin,
  destination: s.destination,
  departDate: s.departDate,
  returnDate: s.returnDate,
};

/** Contenedor de un grupo de segmentos con borde común (como Origen | Destino). */
const groupClasses =
  'relative flex flex-col divide-y-2 divide-border rounded border-2 border-input bg-surface sm:flex-row sm:divide-x-2 sm:divide-y-0';

export function SearchForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [announcement, setAnnouncement] = useState('');
  const [paxOpen, setPaxOpen] = useState(false);

  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    clearErrors,
    trigger,
    watch,
    reset,
    setFocus,
    formState: { errors, touchedFields, isSubmitted },
  } = useForm<SearchFormInput>({
    resolver: zodResolver(SearchFormSchema),
    defaultValues: SEARCH_DEFAULTS,
    // Corrección en tiempo real: cada cambio se valida; los mensajes aparecen al salir del campo.
    mode: 'onChange',
    reValidateMode: 'onChange',
    shouldFocusError: false,
  });

  // Prellenado desde la URL: "Modificar búsqueda" o un destino sugerido (/?destino=CUE#buscador).
  const query = params.toString();
  useEffect(() => {
    if (!query) return;
    const q = new URLSearchParams(query);
    const onlyDestination = q.has('destino') && [...q.keys()].length === 1;
    if (onlyDestination) {
      const { destination } = queryToForm(q);
      if (!destination) return;
      setValue('destination', destination, { shouldValidate: true });
      const city = findAirport(destination)?.city ?? destination;
      setAnnouncement(fmt(s.destinationPrefilled, { city }));
    } else {
      reset(queryToForm(q));
      void trigger();
    }
  }, [query, reset, setValue, trigger]);

  const values = watch();
  const { tripType, adults, children, infants, cabin, departDate, origin, destination, returnDate } = values;
  const parsed = useMemo(() => SearchFormSchema.safeParse(values), [values]);
  const ready = parsed.success;

  // Qué falta por llenar (campos vacíos): se dice junto al botón mientras está desactivado.
  const missing = [
    ...(origin ? [] : [LABELS.origin]),
    ...(destination ? [] : [LABELS.destination]),
    ...(departDate ? [] : [LABELS.departDate]),
    ...(tripType === 'ROUND' && !returnDate ? [LABELS.returnDate] : []),
  ];
  const hasOtherIssue = !ready && missing.length === 0;

  // Un error se muestra cuando el usuario ya pasó por el campo (o intentó enviar): no se regaña a mitad de palabra.
  const shown = (key: 'origin' | 'destination' | 'departDate' | 'returnDate') =>
    touchedFields[key] || isSubmitted ? errors[key]?.message : undefined;

  // Catálogo estático (la API no lista aeropuertos). Lo que no tiene vuelos se ve, pero explica por qué no se puede elegir.
  const originOptions = useMemo<ComboboxOption[]>(() => airportOptions(), []);
  const destinationOptions = useMemo<ComboboxOption[]>(
    () =>
      airportOptions().map((o) =>
        origin && o.value === origin
          ? { ...o, disabledReason: s.sameAsOrigin }
          : origin && !hasFlights(origin, o.value)
            ? { ...o, disabledReason: fmt(s.noFlightsFrom, { city: cityOf(origin) }) }
            : o,
      ),
    [origin],
  );
  const total = adults + children + infants;
  const canAddMore = total < MAX_PASSENGERS;
  const minReturn = parseDisplayDate(departDate) ?? today();
  // Valor corto en el botón; la cabina solo se menciona si no es la habitual (Económica).
  const paxValue =
    cabin === 'BUSINESS'
      ? fmt(s.passengersValueBusiness, { count: total })
      : total === 1
        ? s.passengersValueOne
        : fmt(s.passengersValueMany, { count: total });
  const paxError = errors.adults?.message ?? errors.children?.message ?? errors.infants?.message;

  const onValid = (data: SearchFormInput) => {
    navigate(routes.results(formToQuery(data)));
  };

  // Enter con datos incompletos (el botón está desactivado): se muestran los errores y se lleva el foco al primero.
  const onInvalid = () => {
    void trigger().then(() => {
      const first = (['origin', 'destination', 'departDate', 'returnDate'] as const).find((k) => k !== 'returnDate' || getValues('tripType') === 'ROUND');
      const bad = (['origin', 'destination', 'departDate', 'returnDate'] as const).find((k) => !getValues(k));
      setFocus(bad ?? first ?? 'origin');
    });
  };

  const swap = () => {
    const { origin: from, destination: to } = getValues();
    setValue('origin', to, { shouldValidate: true });
    setValue('destination', from, { shouldValidate: true });
    setAnnouncement(s.swapped);
  };

  const changeTrip = (value: TripType) => {
    setValue('tripType', value, { shouldValidate: true });
    if (value === 'ONE_WAY') {
      setValue('returnDate', '');
      clearErrors('returnDate');
    }
  };

  const comboLabels = {
    emptyText: (typed: string) => fmt(s.noMatch, { typed }),
    listLabel: s.suggestions,
    countText: (count: number) => (count === 1 ? s.suggestionsOne : fmt(s.suggestionsMany, { count })),
    clearLabel: s.clear,
  };

  return (
    <form noValidate aria-label={s.formLabel} onSubmit={handleSubmit(onValid, onInvalid)} className="flex flex-col gap-6">
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>

      {/* Ida y vuelta / Solo ida: grupo de opciones con aspecto de interruptor segmentado. */}
      <RadioGroupPrimitive.Root
        id={IDS.tripType}
        aria-label={s.tripType}
        value={tripType}
        onValueChange={(v) => changeTrip(v as TripType)}
        orientation="horizontal"
        className="inline-flex self-start rounded-full border-2 border-border bg-background p-[4px]"
      >
        {(
          [
            ['ROUND', s.roundTrip],
            ['ONE_WAY', s.oneWay],
          ] as const
        ).map(([value, label]) => (
          <RadioGroupPrimitive.Item
            key={value}
            value={value}
            className={cn(
              'min-h-12 rounded-full px-6 text-base text-foreground transition-colors duration-150 motion-reduce:transition-none',
              'hover:bg-surface/60 data-[state=checked]:bg-surface data-[state=checked]:font-bold data-[state=checked]:shadow-card',
            )}
          >
            {label}
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,2.5fr)_minmax(0,1.8fr)_minmax(0,1fr)_auto]">
        {/* Origen | Destino */}
        <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-1">
          <div className={groupClasses}>
            <CompactField
              id={IDS.origin}
              label={s.origin}
              hint={s.originHint}
              icon={<PlaneTakeoff className="size-6" />}
              error={shown('origin')}
              required
              className="flex-1"
            >
              <Controller
                control={control}
                name="origin"
                render={({ field }) => (
                  <Combobox
                    ref={field.ref}
                    name={field.name}
                    variant="bare"
                    options={originOptions}
                    value={field.value}
                    placeholder={s.chooseOrigin}
                    onBlur={field.onBlur}
                    onValueChange={(v) => {
                      field.onChange(v);
                      // El destino depende del origen: se revisa de inmediato.
                      if (getValues('destination')) void trigger('destination');
                    }}
                    {...comboLabels}
                  />
                )}
              />
            </CompactField>
            <CompactField
              id={IDS.destination}
              label={s.destination}
              hint={s.destinationHint}
              icon={<PlaneLanding className="size-6" />}
              error={shown('destination')}
              required
              offsetStart
              className="flex-1"
            >
              <Controller
                control={control}
                name="destination"
                render={({ field }) => (
                  <Combobox
                    ref={field.ref}
                    name={field.name}
                    variant="bare"
                    options={destinationOptions}
                    value={field.value}
                    placeholder={s.chooseDestination}
                    onBlur={field.onBlur}
                    onValueChange={field.onChange}
                    {...comboLabels}
                  />
                )}
              />
            </CompactField>
            <button
              type="button"
              onClick={swap}
              aria-label={s.swap}
              className={cn(
                'absolute right-16 top-1/2 z-20 flex size-12 -translate-y-1/2 items-center justify-center rounded-full border-2 border-input bg-surface text-primary',
                'hover:bg-primary-tint sm:left-1/2 sm:right-auto sm:-translate-x-1/2',
              )}
            >
              <ArrowLeftRight aria-hidden="true" className="size-6 rotate-90 sm:rotate-0" />
            </button>
          </div>
          <FieldError id={`${IDS.origin}-error`} message={shown('origin')} />
          <FieldError id={`${IDS.destination}-error`} message={shown('destination')} />
        </div>

        {/* Salida | Regreso */}
        <div className="flex flex-col gap-2">
          <div className={groupClasses}>
            <CompactField
              id={IDS.departDate}
              label={s.departDate}
              hint={s.departHint}
              error={shown('departDate')}
              required
              className="flex-1"
            >
              <Controller
                control={control}
                name="departDate"
                render={({ field }) => (
                  <DatePicker
                    ref={field.ref}
                    name={field.name}
                    value={field.value}
                    onBlur={field.onBlur}
                    onValueChange={(v) => {
                      field.onChange(v);
                      // El regreso no puede ser antes de la salida: se revisa de inmediato.
                      if (getValues('returnDate')) void trigger('returnDate');
                    }}
                    variant="bare"
                    calendarLabel={s.departCalendar}
                    minDate={today()}
                    maxDate={lastFlightDate()}
                  />
                )}
              />
            </CompactField>
            {tripType === 'ROUND' ? (
              <CompactField
                id={IDS.returnDate}
                label={s.returnDate}
                hint={s.returnHint}
                error={shown('returnDate')}
                required
                className="flex-1"
              >
                <Controller
                  control={control}
                  name="returnDate"
                  render={({ field }) => (
                    <DatePicker
                      ref={field.ref}
                      name={field.name}
                      value={field.value}
                      onBlur={field.onBlur}
                      onValueChange={field.onChange}
                      variant="bare"
                      calendarLabel={s.returnCalendar}
                      minDate={minReturn}
                      maxDate={lastFlightDate()}
                    />
                  )}
                />
              </CompactField>
            ) : null}
          </div>
          <FieldError id={`${IDS.departDate}-error`} message={shown('departDate')} />
          <FieldError id={`${IDS.returnDate}-error`} message={shown('returnDate')} />
        </div>

        {/* Pasajeros y cabina en un panel desplegable */}
        <Popover.Root open={paxOpen} onOpenChange={setPaxOpen}>
          <Popover.Trigger asChild>
            <button
              id={IDS.adults}
              type="button"
              aria-describedby={paxError ? `${IDS.adults}-error` : undefined}
              className={cn(
                'flex h-[4.25rem] min-w-0 items-center gap-2 rounded border-2 border-input bg-surface px-4 text-left hover:bg-background',
                paxError && 'bg-error-tint',
              )}
            >
              <Users aria-hidden="true" className={cn('size-6 shrink-0', paxError ? 'text-error' : 'text-muted')} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn('text-sm leading-none', paxError ? 'font-bold text-error' : 'text-muted')}>
                  {s.passengers}
                </span>
                <span className="truncate pt-2 text-sm font-bold">{paxValue}</span>
              </span>
              <ChevronDown aria-hidden="true" className="size-6 shrink-0 text-muted" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              aria-label={s.passengersAndCabin}
              side="bottom"
              align="end"
              sideOffset={8}
              collisionPadding={16}
              className="z-50 flex max-h-[var(--radix-popover-content-available-height)] w-[min(24rem,calc(100vw-2rem))] flex-col gap-4 overflow-y-auto rounded border-2 border-border bg-surface p-6 shadow-raised animate-fade-in"
            >
              <Controller
                control={control}
                name="adults"
                render={({ field }) => (
                  <QuantityInput
                    label={s.adults}
                    hint={s.adultsHint}
                    value={field.value}
                    min={1}
                    canIncrease={canAddMore}
                    onChange={(n) => {
                      field.onChange(n);
                      // Al quitar un adulto, los infantes no pueden superar a los adultos.
                      if (getValues('infants') > n) setValue('infants', n, { shouldValidate: isSubmitted });
                    }}
                  />
                )}
              />
              <Controller
                control={control}
                name="children"
                render={({ field }) => (
                  <QuantityInput
                    label={s.children}
                    hint={s.childrenHint}
                    value={field.value}
                    canIncrease={canAddMore}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={control}
                name="infants"
                render={({ field }) => (
                  <QuantityInput
                    label={s.infants}
                    hint={s.infantsHint}
                    value={field.value}
                    canIncrease={canAddMore && field.value < adults}
                    onChange={field.onChange}
                  />
                )}
              />
              <p className="text-sm text-muted">{fmt(s.passengersSummary, { count: total })}</p>
              <Controller
                control={control}
                name="cabin"
                render={({ field }) => (
                  <RadioGroup
                    legend={s.cabin}
                    appearance="list"
                    orientation="vertical"
                    value={field.value}
                    onValueChange={field.onChange}
                    className="border-t-2 border-border pt-4"
                    options={[
                      { value: 'ECONOMY', label: s.cabinEconomy },
                      { value: 'BUSINESS', label: s.cabinBusiness },
                    ]}
                  />
                )}
              />
              <Popover.Close asChild>
                <Button variant="secondary" fullWidth>
                  {s.done}
                </Button>
              </Popover.Close>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        <Button
          type="submit"
          size="lg"
          disabled={!ready}
          aria-describedby="search-status"
          className="h-[4.25rem] md:col-span-2 xl:col-span-1 xl:px-6"
        >
          <Search aria-hidden="true" />
          <span className="xl:hidden">{s.submit}</span>
          <span className="hidden xl:inline">{s.submitShort}</span>
        </Button>
      </div>

      {/* Estado del formulario siempre a la vista: qué falta o que ya se puede buscar. */}
      <p id="search-status" role="status" className={cn('flex items-center gap-2 text-sm font-bold', ready ? 'text-success' : 'text-muted')}>
        {ready ? (
          <>
            <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
            {s.ready}
          </>
        ) : (
          <>
            <Info aria-hidden="true" className="size-4 shrink-0" />
            {missing.length > 0 ? fmt(s.missing, { fields: joinList(missing.map((l) => l.toLowerCase())) }) : hasOtherIssue ? s.fixIssues : null}
          </>
        )}
      </p>
    </form>
  );
}

/** Opciones del buscador de ciudades: se encuentran por ciudad, apodo, código IATA, aeropuerto o región. */
function airportOptions(): ComboboxOption[] {
  return AIRPORTS.map((a) => ({
    value: a.code,
    label: `${a.city} (${a.code})`,
    detail: a.name,
    icon: <MapPin className="size-6" />,
    keywords: [a.code, a.name, es.home.cities[a.code as keyof typeof es.home.cities] ?? a.city, es.home.worlds[a.region].name],
  }));
}
