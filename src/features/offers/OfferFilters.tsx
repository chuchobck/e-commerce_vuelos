import { cityOf } from '@/shared/api';
import { es } from '@/shared/i18n';

const t = es.offers;

const chip =
  'min-h-12 rounded-full border-2 px-6 font-bold transition-colors duration-150 motion-reduce:transition-none ' +
  'border-input text-foreground hover:border-foreground aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground';

/**
 * Ciudades de salida que tienen ofertas, más «Todas». Solo los orígenes que existen: no hay filtros inventados ni opciones
 * que dejen la lista vacía. Son botones de alternancia (aria-pressed): se recorren con Tab y se activan con Enter o Espacio.
 */
export function OfferFilters({ origins, value, onChange }: { origins: readonly string[]; value: string | null; onChange: (origin: string | null) => void }) {
  return (
    <div role="group" aria-label={t.filtersLabel} className="flex flex-wrap items-center justify-center gap-2">
      <span aria-hidden="true" className="mr-2 font-bold">
        {t.filterFrom}
      </span>
      <button type="button" aria-pressed={value === null} onClick={() => onChange(null)} className={chip}>
        {t.filterAll}
      </button>
      {origins.map((code) => (
        <button key={code} type="button" aria-pressed={value === code} onClick={() => onChange(code)} className={chip}>
          {cityOf(code)}
        </button>
      ))}
    </div>
  );
}
