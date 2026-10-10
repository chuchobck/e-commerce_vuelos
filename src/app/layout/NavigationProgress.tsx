import { useNavigation } from 'react-router-dom';
import { es } from '@/shared/i18n';

/**
 * Al cambiar de página se descarga su código antes de mostrarla: mientras tanto una barra fina arriba y un aviso para el
 * lector de pantalla dicen que algo está pasando (la región en vivo existe siempre, para que se anuncie lo que aparece).
 */
export function NavigationProgress() {
  const loading = useNavigation().state !== 'idle';
  return (
    <div role="status" className="print:hidden">
      {loading ? (
        <>
          <span aria-hidden="true" className="fixed inset-x-0 top-0 z-[80] h-2 bg-primary motion-safe:animate-pulse" />
          <span className="sr-only">{es.a11y.loading}</span>
        </>
      ) : null}
    </div>
  );
}
