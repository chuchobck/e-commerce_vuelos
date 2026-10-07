import { UserRound } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { es, fmt } from '@/shared/i18n';
import { Button, Card, CardTitle } from '@/shared/ui';

const p = es.purchase;

type Mode = 'login' | 'register';

interface AccountBlockProps {
  /** Correo de la cuenta si hay sesión (la API no guarda nombre). */
  email?: string;
  /**
   * Los formularios de ingreso y registro (features/auth) los pone la página: un módulo de
   * `features` no importa de otro. Se muestran aquí mismo, sin salir del paso 2 ni perder la selección.
   */
  loginForm: ReactNode;
  registerForm: ReactNode;
}

/**
 * Bloque de cuenta del paso 2. Sin sesión ofrece dos opciones ("Ya tengo cuenta" / "Crear cuenta")
 * con su formulario incrustado; con sesión se reduce a "Compras como …".
 */
export function AccountBlock({ email, loginForm, registerForm }: AccountBlockProps) {
  const [mode, setMode] = useState<Mode>('register');
  const panelId = useId();

  if (email) {
    return (
      <Card role="status" className="flex items-center gap-4">
        <UserRound aria-hidden="true" className="size-8 shrink-0 text-primary" />
        <p className="min-w-0 break-words text-lg font-bold">{fmt(p.buyingAs, { email })}</p>
      </Card>
    );
  }

  const options: { mode: Mode; label: string }[] = [
    { mode: 'login', label: p.haveAccount },
    { mode: 'register', label: p.createAccount },
  ];
  return (
    <Card className="flex flex-col gap-4">
      <CardTitle>{p.accountTitle}</CardTitle>
      <p className="text-muted">{p.accountText}</p>
      <div role="group" aria-label={p.accountOptions} className="flex flex-wrap gap-4">
        {options.map((o) => (
          <Button key={o.mode} variant={mode === o.mode ? 'primary' : 'secondary'} aria-pressed={mode === o.mode} aria-controls={panelId} onClick={() => setMode(o.mode)}>
            {o.label}
          </Button>
        ))}
      </div>
      <div id={panelId} className="max-w-[32rem]">
        {mode === 'login' ? loginForm : registerForm}
      </div>
    </Card>
  );
}
