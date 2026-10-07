import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { useAuth } from '@/app/providers/AuthProvider';
import { RegisterSchema, type RegisterInput } from '@/features/auth';
import { errorMessage, isApiError } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { useErrorSummary } from '@/shared/lib/useErrorSummary';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  ErrorSummary,
  Field,
  Input,
  NumericInput,
  PasswordInput,
  RadioGroup,
  toast,
} from '@/shared/ui';

const a = es.auth;

const FIELDS = {
  firstName: { id: 'reg-first', label: a.firstName },
  lastName: { id: 'reg-last', label: a.lastName },
  documentType: { id: 'reg-doctype', label: a.documentType },
  documentNumber: { id: 'reg-doc', label: a.documentNumber },
  email: { id: 'reg-email', label: a.email },
  phone: { id: 'reg-phone', label: a.phone },
  password: { id: 'reg-password', label: a.newPassword },
  terms: { id: 'reg-terms', label: es.footer.terms },
};

export function RegisterPage() {
  const { register: registerAccount } = useAuth();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<unknown>(null);

  const {
    control,
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitted, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      documentType: 'CEDULA',
      documentNumber: '',
      email: '',
      phone: '',
      password: '',
      terms: false,
    },
    shouldFocusError: false,
  });
  const { summary, summaryRef, onInvalid, clear } = useErrorSummary<RegisterInput>(FIELDS, errors, isSubmitted);
  const documentType = watch('documentType');

  const onValid = async ({ terms: _terms, ...values }: RegisterInput) => {
    clear();
    setSubmitError(null);
    try {
      const s = await registerAccount(values);
      toast({ title: fmt(a.registered, { name: s.user.firstName.split(' ')[0] }), variant: 'success' });
      navigate('/mis-reservas', { replace: true });
    } catch (error) {
      if (isApiError(error) && error.code === 'EMAIL_TAKEN') {
        setError('email', { message: a.emailTaken }, { shouldFocus: true });
      } else {
        setSubmitError(error);
      }
    }
  };

  return (
    <Page title={a.registerTitle} heading={a.registerHeading} lead={a.registerLead} width="narrow">
      <Card>
        <form noValidate onSubmit={handleSubmit(onValid, onInvalid)} className="flex flex-col gap-6">
          <ErrorSummary ref={summaryRef} errors={summary} />
          {submitError ? (
            <Alert variant="error" live="assertive">
              <p>{errorMessage(submitError)}</p>
            </Alert>
          ) : null}

          <div className="grid items-start gap-6 sm:grid-cols-2">
            <Field id={FIELDS.firstName.id} label={a.firstName} error={errors.firstName?.message} required>
              <Input {...register('firstName')} autoComplete="given-name" />
            </Field>
            <Field id={FIELDS.lastName.id} label={a.lastName} error={errors.lastName?.message} required>
              <Input {...register('lastName')} autoComplete="family-name" />
            </Field>
          </div>

          <Controller
            control={control}
            name="documentType"
            render={({ field }) => (
              <RadioGroup
                id={FIELDS.documentType.id}
                legend={a.documentType}
                value={field.value}
                onValueChange={field.onChange}
                options={[
                  { value: 'CEDULA', label: a.cedula, hint: a.cedulaHint },
                  { value: 'PASSPORT', label: a.passport, hint: a.passportHint },
                ]}
              />
            )}
          />

          <Field
            id={FIELDS.documentNumber.id}
            label={a.documentNumber}
            hint={documentType === 'CEDULA' ? a.cedulaHint : a.passportHint}
            error={errors.documentNumber?.message}
            required
          >
            {documentType === 'CEDULA' ? (
              <Controller
                control={control}
                name="documentNumber"
                render={({ field }) => (
                  <NumericInput
                    ref={field.ref}
                    name={field.name}
                    onBlur={field.onBlur}
                    value={field.value}
                    onValueChange={field.onChange}
                    maxDigits={10}
                  />
                )}
              />
            ) : (
              <Input {...register('documentNumber')} autoComplete="off" spellCheck={false} maxLength={12} className="uppercase" />
            )}
          </Field>

          <Field id={FIELDS.email.id} label={a.email} error={errors.email?.message} required>
            <Input {...register('email')} type="email" autoComplete="email" inputMode="email" spellCheck={false} />
          </Field>

          <Field id={FIELDS.phone.id} label={a.phone} hint={a.phoneHint} error={errors.phone?.message} required>
            <Controller
              control={control}
              name="phone"
              render={({ field }) => (
                <NumericInput
                  ref={field.ref}
                  name={field.name}
                  onBlur={field.onBlur}
                  value={field.value}
                  onValueChange={field.onChange}
                  maxDigits={9}
                  prefix={a.phonePrefix}
                  autoComplete="tel-national"
                  inputMode="tel"
                />
              )}
            />
          </Field>

          <Field id={FIELDS.password.id} label={a.newPassword} hint={a.passwordHint} error={errors.password?.message} required>
            <PasswordInput {...register('password')} autoComplete="new-password" />
          </Field>

          <Controller
            control={control}
            name="terms"
            render={({ field }) => (
              <Checkbox
                id={FIELDS.terms.id}
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
      </Card>
      <p className="text-center">
        {a.haveAccount} <Link to="/ingresar">{a.goLogin}</Link>
      </p>
    </Page>
  );
}
