import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { authErrorMessage, authFieldErrors, isApiError, type User } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { Alert, Button, Checkbox, Field, Input, PasswordInput } from '@/shared/ui';
import { useAuth } from './AuthProvider';
import { AccountCreatedError } from './session';
import { RegisterSchema, type RegisterInput } from './schemas';

const a = es.auth;

export interface RegisterFormProps {
  idPrefix?: string;
  onSuccess: (user: User) => void;
}

/**
 * Formulario de registro, reutilizable. La API solo pide correo y contraseña y no entrega tokens al
 * registrar: la sesión crea la cuenta y luego ingresa (session.register).
 */
export function RegisterForm({ idPrefix = 'reg', onSuccess }: RegisterFormProps) {
  const { register: registerAccount } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
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
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { email: '', password: '', remember: false, terms: false },
    mode: 'onTouched',
    shouldFocusError: true,
  });

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

  const onValid = async (values: RegisterInput) => {
    setSubmitError(null);
    try {
      const user = await registerAccount({ email: values.email, password: values.password }, values.remember);
      onSuccess(user);
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
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
      {submitError ? (
        <Alert variant="error" live="assertive">
          <p>{submitError}</p>
        </Alert>
      ) : null}
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
      <Button type="submit" size="lg" loading={isSubmitting} loadingText={a.submittingRegister}>
        <UserPlus aria-hidden="true" />
        {a.submitRegister}
      </Button>
    </form>
  );
}
