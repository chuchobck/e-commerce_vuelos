import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import type { SeatFilters } from '../model/filters';

const t = es.seats;

interface SeatFiltersBarProps {
  filters: SeatFilters;
  onChange: (filters: SeatFilters) => void;
  /** "Juntos" solo tiene sentido con dos o más pasajeros con asiento. */
  canTogether: boolean;
}

const OPTIONS: { key: keyof SeatFilters; label: string }[] = [
  { key: 'window', label: t.filterWindow },
  { key: 'aisle', label: t.filterAisle },
  { key: 'together', label: t.filterTogether },
  { key: 'extraSpace', label: t.filterExtraSpace },
];

/** Filtros como botones de dos estados (aria-pressed): ventana, pasillo, juntos, más espacio. */
export function SeatFiltersBar({ filters, onChange, canTogether }: SeatFiltersBarProps) {
  return (
    <div role="group" aria-label={t.filtersLabel} className="flex flex-wrap gap-2">
      {OPTIONS.map(({ key, label }) => {
        const disabled = key === 'together' && !canTogether;
        const pressed = filters[key] && !disabled;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={pressed}
            aria-disabled={disabled || undefined}
            aria-describedby={disabled ? 'seat-together-hint' : undefined}
            onClick={() => !disabled && onChange({ ...filters, [key]: !filters[key] })}
            className={cn(
              'min-h-12 rounded-full border-2 px-4 text-sm font-bold',
              pressed ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-surface hover:bg-primary-tint',
              disabled && 'cursor-not-allowed text-muted',
            )}
          >
            {pressed ? <span aria-hidden="true">✓ </span> : null}
            {label}
          </button>
        );
      })}
      {!canTogether ? (
        <span id="seat-together-hint" className="sr-only">
          {t.filterTogetherHint}
        </span>
      ) : null}
    </div>
  );
}
