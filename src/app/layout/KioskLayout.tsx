import { Outlet } from 'react-router-dom';
import { es } from '@/shared/i18n';

const MAIN_ID = 'contenido';

/**
 * Marco del kiosko (/kiosko): pantalla completa, sin el menú ni la cuenta del usuario, sin pie de página y sin avisos de sesión.
 * Es un autoservicio público: nada aquí lee ni muestra la cuenta. Al imprimir, todo menos el contenido se oculta.
 */
export function KioskLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <a
        href={`#${MAIN_ID}`}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById(MAIN_ID)?.focus();
        }}
        className="sr-only z-[90] rounded bg-primary px-6 py-4 font-bold text-primary-foreground no-underline focus:not-sr-only focus:fixed focus:left-4 focus:top-4 print:hidden"
      >
        {es.kiosk.skipToContent}
      </a>
      <div className="border-b-2 border-border bg-surface print:hidden">
        <p className="container-page py-4 text-xl font-bold text-primary">{es.kiosk.brand}</p>
      </div>
      <main id={MAIN_ID} tabIndex={-1} className="flex flex-1 flex-col outline-none">
        <Outlet />
      </main>
    </div>
  );
}
