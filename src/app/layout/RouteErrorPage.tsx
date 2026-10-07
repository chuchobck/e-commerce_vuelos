import { Home, RefreshCw } from 'lucide-react';
import { es } from '@/shared/i18n';
import { usePageTitle } from '@/shared/lib/usePageTitle';

/**
 * Último recurso si una página falla al renderizar. No depende del router ni de los
 * proveedores (pueden ser la causa del fallo), por eso usa enlaces y estilos simples.
 */
export function RouteErrorPage() {
  usePageTitle(es.states.errorTitle);
  return (
    <main className="container-page flex min-h-dvh flex-col items-center justify-center gap-6 py-12 text-center">
      <h1 className="text-3xl">{es.states.errorTitle}</h1>
      <p className="text-lg">{es.errors.unknown}</p>
      <div className="flex flex-wrap justify-center gap-4">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-12 items-center gap-2 rounded border-2 border-primary bg-primary px-6 font-bold text-primary-foreground"
        >
          <RefreshCw aria-hidden="true" className="size-6" />
          {es.common.retry}
        </button>
        <a
          href="/"
          className="inline-flex min-h-12 items-center gap-2 rounded border-2 border-primary px-6 font-bold no-underline"
        >
          <Home aria-hidden="true" className="size-6" />
          {es.common.goHome}
        </a>
      </div>
    </main>
  );
}
