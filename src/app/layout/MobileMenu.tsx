import * as DialogPrimitive from '@radix-ui/react-dialog';
import { LogIn, LogOut, Menu, UserPlus, UserRound, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { routes, safeReturnTo } from '@/app/routes';
import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Button, toast } from '@/shared/ui';
import { isNavItemActive, NAV_ITEMS } from './nav-items';

/**
 * Menú para pantallas pequeñas. Es un diálogo modal (Radix): atrapa el foco al abrirse,
 * se cierra con Esc o con el botón de 48 px y devuelve el foco al botón "Menú".
 * Repite el menú principal y el menú de usuario del header.
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const returnTo = safeReturnTo(pathname + search) ?? undefined;
  const close = () => setOpen(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="secondary" className="min-w-12 px-2 sm:px-4 lg:hidden" aria-label={es.nav.openMenu}>
          <Menu aria-hidden="true" />
          <span aria-hidden="true">{es.nav.menuTitle}</span>
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay/60 animate-fade-in lg:hidden" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[24rem] flex-col gap-6 overflow-y-auto bg-surface p-6 shadow-raised animate-slide-up lg:hidden"
        >
          <div className="flex items-center justify-between">
            <DialogPrimitive.Title className="text-2xl font-bold">{es.nav.menuTitle}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label={es.nav.closeMenu}>
                <X aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <nav aria-label={es.a11y.mainNav}>
            <ul className="flex flex-col gap-2">
              {NAV_ITEMS.map((item) => {
                const active = isNavItemActive(item, pathname);
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={close}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-12 items-center gap-4 rounded border-2 px-4 font-bold no-underline',
                        active ? 'border-primary bg-primary-tint text-primary' : 'border-transparent text-foreground hover:bg-primary-tint',
                      )}
                    >
                      <Icon aria-hidden="true" className="size-6" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="mt-auto flex flex-col gap-4 border-t-2 border-border pt-6">
            {session ? (
              <>
                <p className="flex flex-col">
                  <span className="text-sm text-muted">{es.nav.accountTitle}</span>
                  <span className="font-bold">
                    {session.user.firstName} {session.user.lastName}
                  </span>
                </p>
                <Button asChild fullWidth>
                  <Link to={routes.profile()} onClick={close}>
                    <UserRound aria-hidden="true" />
                    {es.nav.profile}
                  </Link>
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    logout();
                    close();
                    toast({ title: es.nav.loggedOut, variant: 'success' });
                    navigate(routes.home());
                  }}
                >
                  <LogOut aria-hidden="true" />
                  {es.nav.logout}
                </Button>
              </>
            ) : (
              <>
                <Button asChild fullWidth>
                  <Link to={routes.login(returnTo)} onClick={close}>
                    <LogIn aria-hidden="true" />
                    {es.nav.login}
                  </Link>
                </Button>
                <Button asChild variant="secondary" fullWidth>
                  <Link to={routes.register(returnTo)} onClick={close}>
                    <UserPlus aria-hidden="true" />
                    {es.nav.register}
                  </Link>
                </Button>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
