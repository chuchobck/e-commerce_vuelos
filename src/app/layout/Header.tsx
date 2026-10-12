import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, CircleHelp, LogIn, LogOut, Moon, Sun, Ticket, User, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { useTheme } from '@/app/providers/ThemeProvider';
import { routes, safeReturnTo } from '@/app/routes';
import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Button, toast } from '@/shared/ui';
import { MobileMenu } from './MobileMenu';
import { isNavItemActive, NAV_ITEMS } from './nav-items';

function Logo() {
  return (
    <Link
      to={routes.home()}
      aria-label={es.app.logoAlt}
      className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded text-xl font-bold text-primary no-underline sm:text-2xl"
    >
      <img src="/brand/mark-80.png" alt="" width={40} height={40} decoding="async" className="size-8 sm:size-10" />
      <span>{es.app.name.toLowerCase()}</span>
    </Link>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? es.theme.toLight : es.theme.toDark}
      onClick={toggleTheme}
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}

const MENU_ITEM =
  'flex min-h-12 cursor-pointer items-center gap-2 rounded px-4 text-foreground no-underline outline-none data-[highlighted]:bg-primary-tint data-[highlighted]:outline data-[highlighted]:outline-[3px] data-[highlighted]:outline-focus';

/** Sin sesión: "Ingresar" (vuelve a esta página después). Con sesión: Mis viajes, Mi perfil y Cerrar sesión. */
function UserMenu() {
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  // Mientras se restaura la sesión se reserva el espacio: ni "Ingresar" ni el menú parpadean.
  if (status === 'restoring') return <span aria-hidden="true" className="hidden h-12 w-32 lg:inline-block" />;
  if (!user) {
    return (
      <Button asChild variant="secondary" className="hidden lg:inline-flex">
        <Link to={routes.login(safeReturnTo(pathname + search) ?? undefined)}>
          <LogIn aria-hidden="true" />
          {es.nav.login}
        </Link>
      </Button>
    );
  }
  // La cuenta de la API no tiene nombre: se muestra el correo (abreviado; completo en el nombre accesible).
  const shortName = user.email.split('@')[0];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="secondary"
          className="hidden max-w-60 lg:inline-flex"
          aria-label={fmt(es.nav.userMenu, { name: user.email })}
        >
          <User aria-hidden="true" />
          <span className="truncate">{shortName}</span>
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-64 rounded border-2 border-border bg-surface p-2 shadow-raised animate-fade-in"
        >
          <DropdownMenu.Item asChild className={MENU_ITEM}>
            <Link to={routes.trips()}>
              <Ticket aria-hidden="true" className="size-6 text-primary" />
              {es.nav.trips}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild className={MENU_ITEM}>
            <Link to={routes.profile()}>
              <UserRound aria-hidden="true" className="size-6 text-primary" />
              {es.nav.profile}
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-2 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={() => {
              void logout().then(() => {
                toast({ title: es.nav.loggedOut, variant: 'success' });
                navigate(routes.home());
              });
            }}
            className={MENU_ITEM}
          >
            <LogOut aria-hidden="true" className="size-6 text-primary" />
            {es.nav.logout}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Cabecera estática (no fija): así nunca tapa el elemento enfocado (WCAG 2.4.11).
 * El orden visual coincide con el orden del teclado.
 */
export function Header() {
  const { pathname } = useLocation();
  return (
    <header className="border-b-2 border-border bg-surface print:hidden">
      <div className="container-page flex min-h-20 items-center justify-between gap-2 sm:gap-4">
        <Logo />

        <nav aria-label={es.a11y.mainNav} className="hidden lg:block">
          <ul className="flex items-center gap-2">
            {NAV_ITEMS.map((item) => {
              const active = isNavItemActive(item, pathname);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-12 items-center rounded px-4 font-bold no-underline hover:bg-primary-tint',
                      active ? 'text-primary underline decoration-4 underline-offset-8' : 'text-foreground',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {/* Ayuda: mismo lugar en todas las páginas (WCAG 3.2.6). */}
          <Button asChild variant="ghost" className="min-w-12 px-2 sm:px-4">
            <Link to={routes.help()}>
              <CircleHelp aria-hidden="true" />
              <span className="hidden sm:inline">{es.nav.help}</span>
              <span className="sr-only sm:hidden">{es.nav.help}</span>
            </Link>
          </Button>
          <ThemeToggle />
          <UserMenu />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
