import { LoadingState } from '@/shared/ui';

/** Lo que se ve mientras se descarga la primera página de una entrada directa (p. ej. un enlace a /resultados). */
export function RouteLoading() {
  return (
    <div className="container-page py-16">
      <LoadingState skeletons={2} className="items-center" />
    </div>
  );
}
