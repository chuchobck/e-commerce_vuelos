import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { TRIP_FILTERS, type TripFilter } from './tripFilters';

const t = es.aftersale.list;

const LABEL: Record<TripFilter, string> = { upcoming: t.filterUpcoming, past: t.filterPast, cancelled: t.filterCancelled };

interface TripFiltersProps {
  value: TripFilter;
  onChange: (filter: TripFilter) => void;
  counts: Record<TripFilter, number>;
}

/** Próximos / Pasados / Cancelados como botones de dos estados (aria-pressed), con cuántos hay de cada uno. */
export function TripFilters({ value, onChange, counts }: TripFiltersProps) {
  return (
    <div role="group" aria-label={t.filtersLabel} className="flex flex-wrap gap-2">
      {TRIP_FILTERS.map((filter) => {
        const active = value === filter;
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(filter)}
            className={cn(
              'min-h-12 rounded-full border-2 px-6 font-bold',
              active ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-surface hover:bg-primary-tint',
            )}
          >
            {active ? <span aria-hidden="true">✓ </span> : null}
            {LABEL[filter]} <span className="font-normal tabular-nums">({counts[filter]})</span>
          </button>
        );
      })}
    </div>
  );
}
