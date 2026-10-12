import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { Select } from '@/shared/ui';
import type { SortKey } from './grouping';

const r = es.results;

interface ResultsToolbarProps {
  count: number;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  directOnly: boolean;
  onDirectOnly: (value: boolean) => void;
  /** Solo se ofrece "Solo directos" si hay vuelos con escala que filtrar. */
  canFilterDirect: boolean;
}

/** Ordenar y filtrar la lista. El conteo se anuncia (aria-live) para que se note el efecto de cada cambio. */
export function ResultsToolbar({ count, sort, onSort, directOnly, onDirectOnly, canFilterDirect }: ResultsToolbarProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <p role="status" className="font-bold">
        {count === 1 ? r.foundOne : fmt(r.found, { count })}
      </p>
      <div className="flex flex-wrap items-end gap-4">
        {canFilterDirect ? (
          <button
            type="button"
            aria-pressed={directOnly}
            onClick={() => onDirectOnly(!directOnly)}
            className={cn(
              'min-h-12 rounded-full border-2 px-6 font-bold',
              directOnly ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-surface hover:bg-primary-tint',
            )}
          >
            {directOnly ? <span aria-hidden="true">✓ </span> : null}
            {r.onlyDirect}
          </button>
        ) : null}
        <label className="flex flex-col gap-1 text-sm font-bold">
          {r.sortBy}
          <Select
            value={sort}
            onChange={(event) => onSort(event.target.value as SortKey)}
            options={[
              { value: 'price', label: r.sortPrice },
              { value: 'departure', label: r.sortDeparture },
              { value: 'duration', label: r.sortDuration },
            ]}
          />
        </label>
      </div>
    </div>
  );
}
