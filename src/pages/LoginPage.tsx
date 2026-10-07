import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { useAuth } from '@/app/providers/AuthProvider';
import { LoginSchema, type LoginInput } from '@/features/auth';
import { errorMessage } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { useErrorSummary } from '@/shared/lib/useErrorSummary';
import { Alert, Button, Card, ErrorSummary, Field, Input, PasswordInput, toast } from '@/shared/ui';

const a = es.auth;

const FIELDS = {
  email: { id: 'login-email', label: a.email },
  password: { id: 'login-password', label: a.password },
};

export function LoginPage() {
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/mis-reservas';
  const [submitError, setSubmitError] = useState<unknown>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitted, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: '', password: '' },
    shouldFocusError: false,
  });
  const { summary, summaryRef, onInvalid, clear } = useErrorSummary<LoginInput>(FIELDS, errors, isSubmitted);

  const onValid = async (values: LoginInput) => {
    clear();
    setSubmitError(null);
    try {
      const s = await login(values);
      toast({ title: fmt(a.welcome, { name: s.user.firstName.split(' ')[0] }), variant: 'success' });
      navigate(from, { replace: true });
    } catch (error) {
      setSubmitError(error);
    }
  };

  return (
    <Page title={a.loginTitle} heading={a.loginHeading} lead={a.loginLead} width="narrow">
      {session ? (
        <Alert variant="success" title={fmt(a.alreadyIn, { name: session.user.firstName })}>
          <Link to="/mis-reservas">{a.goBookings}</Link>
        </Alert>
      ) : null}
      <Card>
        <form noValidate onSubmit={handleSubmit(onValid, onInvalid)} className="flex flex-col gap-6">
          <ErrorSummary ref={summaryRef} errors={summary} />
          {submitError ? (
            <Alert variant="error" live="assertive">
              <p>{errorMessage(submitError)}</p>
            </Alert>
          ) : null}
          <Field id={FIELDS.email.id} label={a.email} error={errors.email?.message} required>
            <Input {...register('email')} type="email" autoComplete="email" inputMode="email" spellCheck={false} />
          </Field>
          <Field id={FIELDS.password.id} label={a.password} hint={a.passwordHint} error={errors.password?.message} required>
            <PasswordInput {...register('password')} autoComplete="current-password" />
          </Field>
          <Button type="submit" size="lg" loading={isSubmitting} loadingText={a.submittingLogin}>
            <LogIn aria-hidden="true" />
            {a.submitLogin}
          </Button>
          <p className="text-sm text-muted">{a.demoHint}</p>
        </form>
      </Card>
      <p className="text-center">
        {a.noAccount} <Link to="/registrarse">{a.createAccount}</Link>
      </p>
    </Page>
  );
}
