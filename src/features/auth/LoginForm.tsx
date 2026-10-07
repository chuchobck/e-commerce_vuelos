import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn } from 'lucide-react';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { authErrorMessage, authFieldErrors, type User } from '@/shared/api';
import { es } from '@/shared/i18n';
import { Alert, Button, Checkbox, Field, Input, MockOnly, PasswordInput } from '@/shared/ui';
import { useAuth } from './AuthProvider';
import { LoginSchema, type LoginInput } from './schemas';

const a = es.auth;

export interface LoginFormProps {
  /** Prefijo de los id (permite dos formularios en la misma página, p. ej. en el paso 2 de la compra). */
  idPrefix?: string;
  onSuccess: (user: User) => void;
}

/**
 * Formulario de ingreso, reutilizable (página /ingresar y, en F4, paso 2 de la compra).
 * Errores por campo con role="alert" y foco al primero; botón con "cargando" que impide el doble envío.
 */
export function LoginForm({ idPrefix = 'login', onSuccess }: LoginFormProps) {
  const { login } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const ids = { email: `${idPrefix}-email`, password: `${idPrefix}-password`, remember: `${idPrefix}-remember` };

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: '', password: '', remember: false },
    mode: 'onTouched',
    // Al enviar con errores, el foco va al primer campo inválido.
    shouldFocusError: true,
  });

  // Evita el doble envío también con Enter mientras la petición sigue en curso.
  const sending = useRef(false);

  const onValid = async (values: LoginInput) => {
    if (sending.current) return;
    sending.current = true;
    setSubmitError(null);
    try {
      // La contraseña va tal cual la escribió (el backend la normaliza igual que el formulario).
      const user = await login({ email: values.email, password: values.password }, values.remember);
      onSuccess(user);
    } catch (error) {
      const fields = authFieldErrors(error);
      if (fields.email) setError('email', { message: fields.email }, { shouldFocus: true });
      if (fields.password) setError('password', { message: fields.password }, { shouldFocus: !fields.email });
      if (!fields.email && !fields.password) setSubmitError(authErrorMessage(error, 'login'));
    } finally {
      sending.current = false;
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit(onValid)} className="flex flex-col gap-6">
      {submitError ? (
        <Alert variant="error" live="assertive">
          <p>{submitError}</p>
        </Alert>
      ) : null}
      <Field id={ids.email} label={a.email} error={errors.email?.message} required>
        <Input {...register('email')} type="email" autoComplete="email" inputMode="email" spellCheck={false} autoCapitalize="none" />
      </Field>
      <Field id={ids.password} label={a.password} hint={a.passwordHint} error={errors.password?.message} required>
        <PasswordInput {...register('password')} autoComplete="current-password" />
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
      <Button type="submit" size="lg" loading={isSubmitting} loadingText={a.submittingLogin}>
        <LogIn aria-hidden="true" />
        {a.submitLogin}
      </Button>
      <MockOnly>
        <p className="text-sm text-muted">{a.demoHint}</p>
      </MockOnly>
    </form>
  );
}
