import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { RETURN_TO_PARAM, routes, safeReturnTo } from '@/app/routes';
import { LoginForm, useAuth } from '@/features/auth';
import { es, fmt } from '@/shared/i18n';
import { Alert, Card, toast } from '@/shared/ui';

const a = es.auth;

export function LoginPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // A dónde volver (p. ej. la compra en curso); si no hay, a Mis viajes.
  const returnTo = safeReturnTo(params.get(RETURN_TO_PARAM));
  const next = returnTo ?? routes.trips();

  return (
    <Page title={a.loginTitle} heading={a.loginHeading} lead={a.loginLead} width="narrow">
      {user ? (
        <Alert variant="success" title={fmt(a.alreadyIn, { email: user.email })}>
          <Link to={next}>{returnTo ? es.common.continue : a.goTrips}</Link>
        </Alert>
      ) : null}
      <Card>
        <LoginForm
          onSuccess={(u) => {
            toast({ title: fmt(a.welcome, { email: u.email }), variant: 'success' });
            navigate(next, { replace: true });
          }}
        />
      </Card>
      <p className="text-center">
        {a.noAccount} <Link to={routes.register(returnTo ?? undefined)}>{a.createAccount}</Link>
      </p>
    </Page>
  );
}
