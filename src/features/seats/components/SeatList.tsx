import { useState } from 'react';
import { es, fmt } from '@/shared/i18n';
import { Button, Checkbox } from '@/shared/ui';
import { extrasOf, positionText, stateText, type SeatState } from '../model/describe';
import type { SeatCabin, SeatCell } from '../model/layout';
import type { SeatHolder } from './SeatMapView';

const t = es.seats;

interface SeatListProps {
  cabins: SeatCabin[];
  /** Cabina de la tarifa: solo se listan sus asientos (los de otras cabinas no se pueden elegir). */
  cabin: string;
  caption: string;
  cabinLabel: string;
  stateOf: (seat: SeatCell) => { state: SeatState; holder?: SeatHolder };
  matches: (seat: SeatCell) => boolean;
  /** Pasajero que está eligiendo (para el texto de los botones). */
  activeName: string | undefined;
  onSelect: (seat: SeatCell) => void;
}

/**
 * Alternativa accesible al mapa: una tabla con los mismos asientos, filtros y acciones.
 * Por defecto solo muestra los libres y los elegidos; se pueden mostrar también los ocupados.
 */
export function SeatList({ cabins, cabin, caption, cabinLabel, stateOf, matches, activeName, onSelect }: SeatListProps) {
  const [showTaken, setShowTaken] = useState(false);
  const seats = cabins
    .filter((c) => c.cabin === cabin)
    .flatMap((c) => c.rows)
    .flatMap((row) => row.seats)
    .filter((seat) => matches(seat) && (showTaken || stateOf(seat).state !== 'taken'));

  return (
    <div className="flex flex-col gap-4">
      <Checkbox label={t.showTaken} checked={showTaken} onCheckedChange={(checked) => setShowTaken(checked === true)} />
      {seats.length === 0 ? (
        <p role="status" className="rounded border-2 border-dashed border-input bg-surface p-4">
          {t.listEmpty}
        </p>
      ) : (
        <div role="region" aria-label={t.listRegion} className="max-h-[28rem] overflow-auto rounded border-2 border-border">
          <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 bg-primary-tint">
              <tr>
                <th scope="col" className="p-2">
                  {t.colSeat}
                </th>
                <th scope="col" className="p-2">
                  {t.colPosition}
                </th>
                <th scope="col" className="p-2">
                  {t.colState}
                </th>
                <th scope="col" className="p-2">
                  <span className="sr-only">{t.colAction}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="colgroup" colSpan={4} className="bg-background p-2 text-left">
                  {cabinLabel}
                </th>
              </tr>
              {seats.map((seat) => {
                const { state, holder } = stateOf(seat);
                const extras = extrasOf(seat);
                return (
                  <tr key={seat.number} className="border-t-2 border-border">
                    <th scope="row" className="p-2 text-base">
                      {seat.number}
                    </th>
                    <td className="p-2">
                      {positionText(seat)}
                      {extras.length > 0 ? `, ${extras.join(', ')}` : ''}
                    </td>
                    <td className="p-2">{stateText(state, holder?.name)}</td>
                    <td className="p-2">
                      {state === 'free' || (state === 'selected' && holder?.isActive) ? (
                        <Button
                          variant={state === 'selected' ? 'secondary' : 'primary'}
                          aria-label={fmt(state === 'selected' ? t.listRemoveFor : t.listPickFor, {
                            seat: seat.number,
                            name: activeName ?? '',
                          })}
                          onClick={() => onSelect(seat)}
                        >
                          {state === 'selected' ? t.listRemove : t.listPick}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
