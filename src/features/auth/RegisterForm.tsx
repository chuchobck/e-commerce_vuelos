import { zodResolver } from '@hookform/resolvers/zod';
import { Info, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Controller, get, useForm, useWatch } from 'react-hook-form';
import { authErrorMessage, authFieldErrors, isApiError, type User } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { pendingFromIssues } from '@/shared/lib/formStatus';
import { emptyTraveler, normalizeTraveler, perfilViajero, TRAVELER_KEYS, TravelerFields, type TravelerKey } from '@/shared/profile';
import { Alert, Button, Checkbox, Field, FormStatus, Input, PasswordInput } from '@/shared/ui';
import { useAuth } from './AuthProvider';
import { AccountCreatedError } from './session';
import { registerSchema, type RegisterInput } from './schemas';

const a = es.auth;
const f = es.checkoutForms;
const t = es.travelerForm;

/** Nombre (en minúsculas) de cada campo para «Falta completar: …» junto al botón. */
const TRAVELER_LABEL: Record<TravelerKey, string> = {
  firstName: f.firstName,
  lastName: f.lastName,
  documentType: f.documentType,
  documentNumber: f.documentNumber,
  nationality: f.nationality,
  gender: f.gender,
  birthDate: f.birthDate,
  documentExpiryDate: f.documentExpiry,
  email: t.contactEmail,
  phone: f.phone,
};
const STATUS_LABELS: Record<string, string> = {
  email: a.email,
  password: t.password,
  terms: t.terms,
  ...Object.fromEntries(TRAVELER_KEYS.map((key) => [`traveler.${key}`, TRAVELER_LABEL[key]])),
};
const labelOf = (path: string) => STATUS_LABELS[path]?.toLowerCase();

export interface RegisterFormProps {
  idPrefix?: string;
  /** `profileSaved`: los datos de viajero quedaron guardados en este dispositivo (false si el navegador no lo permitió). */
  onSuccess: (user: User, result: { profileSaved: boolean }) => void;
}

/**
 * Formulario de registro, reutilizable. La cuenta de la API es solo correo y contraseña y no entrega tokens al registrar: la
 * sesión crea la cuenta y luego ingresa (session.register). Los datos de quien viaja se piden aquí pero el backend no tiene
 * perfil: se guardan SOLO en este dispositivo (`perfilViajero`), y solo cuando la cuenta ya se creó y la sesión ya inició.
 * Si algo falla, todo lo escrito se conserva y el error sale junto a su campo.
 */
export function RegisterForm({ idPrefix = 'reg', onSuccess }: RegisterFormProps) {
  const { register: registerAccount } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const schema = useMemo(() => registerSchema(), []);
  const ids = {
    email: `${idPrefix}-email`,
    password: `${idPrefix}-password`,
    remember: `${idPrefix}-remember`,
    terms: `${idPrefix}-terms`,
  };

  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<RegisterInput>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', remember: false, terms: false, traveler: emptyTraveler() },
    mode: 'onTouched',
    shouldFocusError: true,
  });
  const values = useWatch({ control }) as RegisterInput;

  // El correo de contacto sigue al de la cuenta hasta que la persona lo cambie (por defecto es el mismo).
  const accountEmail = values?.email ?? '';
  const contactEdited = !!dirtyFields.traveler?.email;
  useEffect(() => {
    if (!contactEdited) setValue('traveler.email', accountEmail, { shouldDirty: false });
  }, [accountEmail, contactEdited, setValue]);

  // Qué falta, en vivo (no hay resumen de errores: el estado junto al botón lo dice con tono tranquilo).
  const parsed = schema.safeParse(values);
  const pending = parsed.success ? { missing: [], invalid: [] } : pendingFromIssues(parsed.error.issues, (path) => get(values, path), labelOf);

  // Evita el doble envío (también con Enter): el candado se toma en el evento de envío, antes de
  // la validación asíncrona, y se suelta cuando termina todo el envío.
  const sending = useRef(false);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    void handleSubmit(onValid)(event).finally(() => {
      sending.current = false;
    });
  };

  const onValid = async (input: RegisterInput) => {
    setSubmitError(null);
    try {
      // A la API solo van el correo y la contraseña. Nada de los datos de viajero.
      const user = await registerAccount({ email: input.email, password: input.password }, input.remember);
      const profileSaved = perfilViajero.save(user.id, normalizeTraveler(input.traveler));
      onSuccess(user, { profileSaved });
    } catch (error) {
      if (error instanceof AccountCreatedError) {
        setSubmitError(fmt(a.accountCreatedLoginFailed, { reason: authErrorMessage(error.cause, 'login') }));
        return;
      }
      if (isApiError(error) && error.status === 409) {
        setError('email', { message: a.emailTaken }, { shouldFocus: true });
        return;
      }
      const fields = authFieldErrors(error);
      if (fields.email) setError('email', { message: fields.email }, { shouldFocus: true });
      if (fields.password) setError('password', { message: fields.password }, { shouldFocus: !fields.email });
      if (!fields.email && !fields.password) setSubmitError(authErrorMessage(error, 'register'));
    }
  };

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-8">
      {submitError ? (
        <Alert variant="error" live="assertive">
          <p>{submitError}</p>
        </Alert>
      ) : null}

      <fieldset className="flex flex-col gap-6">
        <legend className="mb-6 text-xl font-bold">{t.accountTitle}</legend>
        <Field id={ids.email} label={a.email} error={errors.email?.message} required>
          <Input {...register('email')} type="email" autoComplete="email" inputMode="email" spellCheck={false} autoCapitalize="none" />
        </Field>
        <Field id={ids.password} label={a.newPassword} hint={a.passwordHint} error={errors.password?.message} required>
          <PasswordInput {...register('password')} autoComplete="new-password" />
        </Field>
        <Controller
          control={control}
          name="remember"
          render={({ field }) => (
            <Checkbox
              id={ids.remember}
              ref={field.ref}
              label={a.remember}
              hint={a.rememberHint}
              checked={field.value}
              onCheckedChange={(v) => field.onChange(v === true)}
            />
          )}
        />
      </fieldset>

      <div className="border-t-2 border-border pt-8">
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-4 text-xl font-bold">{t.travelerTitle}</legend>
          <p className="text-muted">{t.travelerLead}</p>
          <p className="flex items-start gap-2 text-sm font-bold">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{t.localNotice}</span>
          </p>
          <TravelerFields<RegisterInput> register={register} setValue={setValue} control={control} errors={errors} name="traveler" idPrefix={`${idPrefix}-trav`} />
        </fieldset>
      </div>

      <div className="flex flex-col gap-6 border-t-2 border-border pt-8">
        <Controller
          control={control}
          name="terms"
          render={({ field }) => (
            <Checkbox
              id={ids.terms}
              ref={field.ref}
              label={a.terms}
              checked={field.value}
              onCheckedChange={(v) => field.onChange(v === true)}
              error={errors.terms?.message}
              aria-required
            />
          )}
        />
        <div className="flex flex-col gap-4">
          <FormStatus id={`${idPrefix}-status`} ready={parsed.success} missing={pending.missing} invalid={pending.invalid} />
          <Button type="submit" size="lg" loading={isSubmitting} loadingText={a.submittingRegister} aria-describedby={`${idPrefix}-status`}>
            <UserPlus aria-hidden="true" />
            {a.submitRegister}
          </Button>
        </div>
      </div>
    </form>
  );
}
