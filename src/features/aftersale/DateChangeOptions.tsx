import type { DateChangeOption } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatDuration, formatTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui';
import { DateChangePrice } from './DateChangePrice';

const t = es.aftersale.dateChange;

interface DateChangeOptionsProps {
  options: readonly DateChangeOption[];
  onChoose: (option: DateChangeOption) => void;
}

/** Alternativas de la nueva fecha: horario, vuelo y la diferencia de precio (+/−) con el total a pagar o reembolsar bien visible. */
export function DateChangeOptions({ options, onChoose }: DateChangeOptionsProps) {
  return (
    <ul aria-label={t.optionsLabel} className="flex flex-col gap-6">
      {options.map((option) => {
        const first = option.segments[0];
        const last = option.segments[option.segments.length - 1];
        const flights = option.segments.map((s) => s.flightNumber).join(' + ');
        const duration = option.segments.reduce((n, s) => n + (s.durationMinutes ?? 0), 0);
        return (
          <li key={option.id}>
            <article aria-label={fmt(t.optionFlight, { flight: flights })} className="flex flex-col gap-4 rounded border-2 border-border bg-surface p-6 shadow-card">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <h3 className="text-xl">
                  <span className="tabular-nums">{formatTime(first.departureTime)}</span> {first.origin} → <span className="tabular-nums">{formatTime(last.arrivalTime)}</span>{' '}
                  {last.destination}
                </h3>
                <p className="text-sm text-muted">
                  {fmt(t.optionFlight, { flight: flights })}
                  {duration > 0 ? ` · ${formatDuration(duration)}` : ''}
                </p>
              </div>
              <DateChangePrice price={option.price} />
              <div>
                <Button onClick={() => onChoose(option)} aria-label={`${t.pickOption}: ${flights}, ${formatTime(first.departureTime)}`}>
                  {t.pickOption}
                </Button>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
