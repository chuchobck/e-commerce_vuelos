import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { RETURN_TO_PARAM, routes, safeReturnTo } from '@/app/routes';
import { RegisterForm } from '@/features/auth';
import { es, fmt } from '@/shared/i18n';
import { Card, toast } from '@/shared/ui';

const a = es.auth;

export function RegisterPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get(RETURN_TO_PARAM));

  return (
    <Page title={a.registerTitle} heading={a.registerHeading} lead={a.registerLead} width="narrow">
      <Card>
        <RegisterForm
          onSuccess={(u) => {
            toast({ title: fmt(a.registered, { email: u.email }), variant: 'success' });
            navigate(returnTo ?? routes.trips(), { replace: true });
          }}
        />
      </Card>
      <p className="text-center">
        {a.haveAccount} <Link to={routes.login(returnTo ?? undefined)}>{a.goLogin}</Link>
      </p>
    </Page>
  );
}
