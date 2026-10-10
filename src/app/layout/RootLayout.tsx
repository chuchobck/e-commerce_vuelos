import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { paths, routes, SEARCH_ANCHOR_ID } from '@/app/routes';
import { useReleaseOnExit } from '@/features/checkout';
import { es } from '@/shared/i18n';
import { ServerWakingNotice, Toaster } from '@/shared/ui';
import { Footer } from './Footer';
import { Header } from './Header';
import { NavigationProgress } from './NavigationProgress';
import { SessionNotices } from './SessionNotices';

const MAIN_ID = 'contenido';

function focusElement(el: HTMLElement | null) {
  if (!el) return false;
  if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
    el.setAttribute('tabindex', '-1');
  }
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'start' });
  return true;
}

/**
 * Al navegar dentro de la SPA:
 *  - si la URL tiene #ancla, se enfoca ese elemento;
 *  - si no, se enfoca el h1 de la nueva página (el lector de pantalla anuncia dónde está).
 * En la primera carga no se mueve el foco.
 */
function useRouteFocus() {
  const location = useLocation();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (location.hash) {
        requestAnimationFrame(() => focusElement(document.getElementById(location.hash.slice(1))));
      }
      return;
    }
    const id = requestAnimationFrame(() => {
      if (location.hash && focusElement(document.getElementById(decodeURIComponent(location.hash.slice(1))))) return;
      window.scrollTo(0, 0);
      focusElement(document.querySelector<HTMLElement>(`#${MAIN_ID} h1`));
    });
    return () => cancelAnimationFrame(id);
  }, [location.key, location.hash]);
}

/** Atajo opcional Alt + B: ir al buscador de vuelos desde cualquier página. */
function useSearchShortcut() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.key.toLowerCase() !== 'b') return;
      e.preventDefault();
      if (location.pathname === paths.home) focusElement(document.getElementById(SEARCH_ANCHOR_ID));
      else navigate(routes.search());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, location.pathname]);
}

export function RootLayout() {
  useRouteFocus();
  useSearchShortcut();
  useReleaseOnExit(useLocation().pathname);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href={`#${MAIN_ID}`}
        onClick={(e) => {
          e.preventDefault();
          focusElement(document.getElementById(MAIN_ID));
        }}
        className="sr-only z-[70] rounded bg-primary print:hidden px-6 py-4 font-bold text-primary-foreground no-underline focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {es.a11y.skipToContent}
      </a>
      <Header />
      <div className="print:hidden">
        <ServerWakingNotice />
        <SessionNotices />
      </div>
      <NavigationProgress />
      <main id={MAIN_ID} tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <Outlet />
      </main>
      <Footer />
      <div className="print:hidden">
        <Toaster />
      </div>
    </div>
  );
}
