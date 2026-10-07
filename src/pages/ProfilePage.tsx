import { Page } from '@/app/layout/Page';
import { useAuth } from '@/app/providers/AuthProvider';
import { es, fmt } from '@/shared/i18n';
import { Card } from '@/shared/ui';

const a = es.auth;

/** Mi perfil: por ahora muestra los datos de la sesión actual. La ruta exige sesión (RequireAuth). */
export function ProfilePage() {
  const { session } = useAuth();
  if (!session) return null;
  const { user } = session;

  const rows = [
    { label: es.profile.fullName, value: `${user.firstName} ${user.lastName}` },
    { label: a.email, value: user.email },
    {
      label: a.documentNumber,
      value: fmt(es.trip.document, {
        type: user.documentType === 'CEDULA' ? a.cedula : a.passport,
        number: user.documentNumber,
      }),
    },
    { label: a.phone, value: `${a.phonePrefix} ${user.phone}` },
  ];

  return (
    <Page title={es.profile.pageTitle} heading={es.profile.heading} lead={es.profile.lead} width="narrow">
      <Card>
        <dl className="flex flex-col divide-y-2 divide-border">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-1 py-4 first:pt-0 last:pb-0 sm:flex-row sm:gap-4">
              <dt className="text-muted sm:w-48 sm:shrink-0">{row.label}</dt>
              <dd className="min-w-0 break-words font-bold">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </Page>
  );
}
