import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, CircleHelp, LogIn, LogOut, Moon, Sun, Ticket, User } from 'lucide-react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useTheme } from '@/app/providers/ThemeProvider';
import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Button, toast } from '@/shared/ui';
import { MobileMenu } from './MobileMenu';
import { NAV_ITEMS } from './nav-items';

function Logo() {
  return (
    <Link
      to="/"
      aria-label={es.app.logoAlt}
      className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded text-xl font-bold text-primary no-underline sm:text-2xl"
    >
      <img src="/brand/favicon.png" alt="" width={40} height={40} className="size-8 sm:size-10" />
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

function UserMenu() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  if (!session) {
    return (
      <Button asChild variant="secondary" className="hidden lg:inline-flex">
        <Link to="/ingresar">
          <LogIn aria-hidden="true" />
          {es.nav.login}
        </Link>
      </Button>
    );
  }
  const name = session.user.firstName.split(' ')[0];
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="secondary" className="hidden lg:inline-flex" aria-label={fmt(es.nav.userMenu, { name })}>
          <User aria-hidden="true" />
          {name}
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-64 rounded border-2 border-border bg-surface p-2 shadow-raised animate-fade-in"
        >
          <DropdownMenu.Item
            onSelect={() => navigate('/mis-reservas')}
            className="flex min-h-12 cursor-pointer items-center gap-2 rounded px-4 outline-none data-[highlighted]:bg-primary-tint data-[highlighted]:outline data-[highlighted]:outline-[3px] data-[highlighted]:outline-focus"
          >
            <Ticket aria-hidden="true" className="size-6 text-primary" />
            {es.nav.bookings}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-2 h-px bg-border" />
          <DropdownMenu.Item
            onSelect={() => {
              logout();
              toast({ title: es.nav.loggedOut, variant: 'success' });
              navigate('/');
            }}
            className="flex min-h-12 cursor-pointer items-center gap-2 rounded px-4 outline-none data-[highlighted]:bg-primary-tint data-[highlighted]:outline data-[highlighted]:outline-[3px] data-[highlighted]:outline-focus"
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
  return (
    <header className="border-b-2 border-border bg-surface">
      <div className="container-page flex min-h-20 items-center justify-between gap-2 sm:gap-4">
        <Logo />

        <nav aria-label={es.a11y.mainNav} className="hidden lg:block">
          <ul className="flex items-center gap-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'inline-flex min-h-12 items-center rounded px-4 font-bold no-underline hover:bg-primary-tint',
                      isActive ? 'text-primary underline decoration-4 underline-offset-8' : 'text-foreground',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          {/* Ayuda: mismo lugar en todas las páginas (WCAG 3.2.6). */}
          <Button asChild variant="ghost" className="min-w-12 px-2 sm:px-4">
            <Link to="/ayuda">
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
