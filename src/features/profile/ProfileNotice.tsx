import { UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { routes } from '@/app/routes';
import { es } from '@/shared/i18n';
import { perfilViajero, usePerfilViajero } from '@/shared/profile';
import { Button } from '@/shared/ui';

const p = es.profile;

/**
 * Aviso discreto para quien ya tenía cuenta y no tiene (o no completó) su perfil de viajero: «Completa tu perfil para comprar
 * más rápido» y un enlace a Mi perfil. No bloquea nada y se puede descartar («Ahora no»: vuelve en la próxima sesión del
 * navegador). `hidden` lo oculta donde estorbaría (la compra, Mi perfil, ingresar y registrarse).
 */
export function ProfileNotice({ userId, hidden = false }: { userId: string | undefined; hidden?: boolean }) {
  const { complete } = usePerfilViajero(userId);
  const [dismissedNow, setDismissedNow] = useState<string | null>(null);
  if (!userId || hidden || complete || dismissedNow === userId || perfilViajero.noticeDismissed(userId)) return null;

  return (
    <aside aria-label={p.noticeLabel} className="border-b-2 border-border bg-primary-tint">
      <div className="container-page flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
        <p className="flex items-center gap-2 font-bold">
          <UserRound aria-hidden="true" className="size-5 shrink-0 text-primary" />
          {p.noticeText}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary">
            <Link to={routes.profile()}>{p.noticeCta}</Link>
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              perfilViajero.dismissNotice(userId);
              setDismissedNow(userId);
            }}
          >
            <X aria-hidden="true" />
            {p.noticeDismiss}
          </Button>
        </div>
      </div>
    </aside>
  );
}
