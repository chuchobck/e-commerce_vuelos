import { LogIn, UserPlus, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { es, fmt } from '@/shared/i18n';
import { Button, Card, CardTitle } from '@/shared/ui';

const p = es.purchase;

interface AccountBlockProps {
  /** Correo de la cuenta si hay sesión (la API no guarda nombre). */
  email?: string;
  /** Enlaces que ya incluyen a dónde volver. */
  loginHref: string;
  registerHref: string;
}

/**
 * Bloque de cuenta del paso 2. Sin sesión pide ingresar o crear la cuenta sin perder la
 * selección; con sesión se reduce a "Compras como …".
 */
export function AccountBlock({ email, loginHref, registerHref }: AccountBlockProps) {
  if (email) {
    return (
      <Card className="flex items-center gap-4">
        <UserRound aria-hidden="true" className="size-8 shrink-0 text-primary" />
        <p className="min-w-0 break-words text-lg font-bold">{fmt(p.buyingAs, { email })}</p>
      </Card>
    );
  }
  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>{p.accountTitle}</CardTitle>
      <p className="text-muted">{p.accountText}</p>
      <div className="flex flex-wrap gap-4">
        <Button asChild>
          <Link to={loginHref}>
            <LogIn aria-hidden="true" />
            {es.nav.login}
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to={registerHref}>
            <UserPlus aria-hidden="true" />
            {es.nav.register}
          </Link>
        </Button>
      </div>
    </Card>
  );
}
