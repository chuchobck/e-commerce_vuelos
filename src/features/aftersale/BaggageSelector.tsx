import { Luggage } from 'lucide-react';
import type { BaggageOption } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatMoney } from '@/shared/lib/format';
import { QuantityInput } from '@/shared/ui';
import { lineKey, remainingFor, type BaggageSelection } from './baggage';

const t = es.aftersale.baggage;

interface BaggageSelectorProps {
  options: readonly BaggageOption[];
  selection: BaggageSelection;
  onChange: (selection: BaggageSelection) => void;
  nameOf: (passengerId: string) => string;
  legOf: (itineraryId: string) => string;
}

/**
 * Selector por pasajero: una cantidad por cada itinerario (ida y vuelta), con el precio de una maleta, cuántas ya compró y
 * el máximo. Cada contador anuncia su valor (QuantityInput usa aria-live) y no deja pasar el máximo.
 */
export function BaggageSelector({ options, selection, onChange, nameOf, legOf }: BaggageSelectorProps) {
  const passengers = [...new Set(options.map((o) => o.passengerId))];
  return (
    <div className="flex flex-col gap-6">
      {passengers.map((passengerId) => (
        <section key={passengerId} aria-labelledby={`bag-${passengerId}`} className="flex flex-col gap-4 rounded border-2 border-border bg-surface p-6 shadow-card">
          <h2 id={`bag-${passengerId}`} className="flex items-center gap-2 text-xl">
            <Luggage aria-hidden="true" className="size-6 text-primary" />
            {fmt(t.passenger, { name: nameOf(passengerId) })}
          </h2>
          <ul className="flex flex-col divide-y-2 divide-border">
            {options
              .filter((o) => o.passengerId === passengerId)
              .map((option) => {
                const key = lineKey(option.passengerId, option.itineraryId);
                const remaining = remainingFor(option);
                const leg = legOf(option.itineraryId);
                return (
                  <li key={key} className="flex flex-col gap-2 py-4">
                    <QuantityInput
                      label={fmt(t.qtyLabel, { name: nameOf(passengerId), leg })}
                      hint={[
                        option.price ? fmt(t.priceEach, { price: formatMoney(option.price) }) : null,
                        option.alreadyPurchased > 0 ? fmt(t.already, { count: option.alreadyPurchased }) : t.alreadyNone,
                        fmt(t.max, { count: option.maxAllowed }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      value={Math.min(selection[key] ?? 0, remaining)}
                      min={0}
                      max={remaining}
                      canIncrease={remaining > 0 && !!option.price}
                      onChange={(quantity) => onChange({ ...selection, [key]: quantity })}
                    />
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
