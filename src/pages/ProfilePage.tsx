import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { useAuth } from '@/features/auth';
import { flightsApi } from '@/shared/api';
import { es } from '@/shared/i18n';
import { formatLongDate } from '@/shared/lib/format';
import { useAsync } from '@/shared/lib/useAsync';
import { Button, Card, ErrorState, LoadingState, toast } from '@/shared/ui';

const p = es.profile;

/**
 * Mi perfil: lo que devuelve GET /auth/me, solo lectura. La API no tiene edición de perfil, así
 * que aquí no se ofrece. La ruta exige sesión (RequireAuth).
 */
export function ProfilePage() {
  const { authorized, logout } = useAuth();
  const navigate = useNavigate();
  const me = useAsync(() => authorized(() => flightsApi.me()), []);

  const signOut = async () => {
    await logout();
    toast({ title: es.nav.loggedOut, variant: 'success' });
    navigate(routes.home());
  };

  let content;
  if (me.status === 'loading' || me.status === 'idle') {
    content = <LoadingState skeletons={1} />;
  } else if (me.status === 'error') {
    content = <ErrorState error={me.error} onRetry={() => void me.execute()} />;
  } else {
    const user = me.data;
    const rows = [
      { label: p.email, value: user.email },
      { label: p.createdAt, value: formatLongDate(user.createdAt) },
      { label: p.roles, value: user.roles.map((r) => p.roleNames[r] ?? r).join(', ') },
    ];
    content = (
      <Card className="flex flex-col gap-6">
        <dl className="flex flex-col divide-y-2 divide-border">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-1 py-4 first:pt-0 sm:flex-row sm:gap-4">
              <dt className="text-muted sm:w-48 sm:shrink-0">{row.label}</dt>
              <dd className="min-w-0 break-words font-bold">{row.value}</dd>
            </div>
          ))}
          <div className="flex flex-col gap-1 py-4 last:pb-0 sm:flex-row sm:gap-4">
            <dt className="text-muted sm:w-48 sm:shrink-0">{p.permissions}</dt>
            <dd className="min-w-0">
              <ul className="flex list-disc flex-col gap-1 pl-5 font-bold">
                {user.scopes.map((s) => (
                  <li key={s}>{p.scopeNames[s] ?? s}</li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
        <div>
          <Button variant="secondary" onClick={() => void signOut()}>
            <LogOut aria-hidden="true" />
            {p.logout}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Page title={p.pageTitle} heading={p.heading} lead={p.lead} width="narrow">
      {content}
    </Page>
  );
}
