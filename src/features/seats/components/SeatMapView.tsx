import { DoorOpen, MoveVertical, Plane, Toilet } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { es, fmt } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import type { SeatState } from '../model/describe';
import type { SeatCell, SeatLayout, SeatRow } from '../model/layout';
import { SeatButton } from './SeatButton';

const t = es.seats;

export interface SeatHolder {
  name: string;
  number: number;
  isActive: boolean;
}

interface SeatMapViewProps {
  layout: SeatLayout;
  /** Cabina de la tarifa: los asientos de otras cabinas se ven, pero no se pueden elegir. */
  cabin: string;
  label: string;
  zoom: number;
  stateOf: (seat: SeatCell) => { state: SeatState; holder?: SeatHolder };
  matches: (seat: SeatCell) => boolean;
  onSelect: (seat: SeatCell) => void;
  /** Asiento al que llevar el foco cuando cambia `nonce` (p. ej. el sugerido tras un conflicto). */
  focusRequest?: { seat: string; nonce: number };
  /** Asiento con el que se empieza al entrar al mapa con Tab. */
  preferredSeat?: string;
  cabinLabel: (cabin: string) => string;
}

type Column = { kind: 'wing' } | { kind: 'aisle' } | { kind: 'label' } | { kind: 'seat'; letter: string };

/** Columnas del avión: ala | letras con el pasillo en medio | ala. Sin pasillo, el número de fila va a la izquierda. */
function columnsOf(layout: SeatLayout): Column[] {
  const columns: Column[] = [{ kind: 'wing' }];
  if (layout.aisleAfter.length === 0) columns.push({ kind: 'label' });
  for (const letter of layout.letters) {
    columns.push({ kind: 'seat', letter });
    if (layout.aisleAfter.includes(letter)) columns.push({ kind: 'aisle' });
  }
  columns.push({ kind: 'wing' });
  return columns;
}

function Banner({ icon, children, tone = 'plain' }: { icon: ReactNode; children: ReactNode; tone?: 'plain' | 'strong' }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'mx-auto my-px flex w-full items-center justify-center gap-2 py-px text-sm font-bold',
        tone === 'strong' ? 'text-foreground' : 'text-muted',
      )}
    >
      <span className="[&_svg]:size-4">{icon}</span>
      {children}
    </div>
  );
}

/**
 * Vista cenital del avión generada desde las filas y letras del mapa: pasillo, alas (solo referencia),
 * salidas de emergencia, filas con más espacio y baños. Es una cuadrícula ARIA con un solo punto de
 * tabulación (roving tabindex): flechas entre asientos, Inicio/Fin en la fila, Ctrl+Inicio/Fin en el mapa.
 */
export function SeatMapView({ layout, cabin, label, zoom, stateOf, matches, onSelect, focusRequest, preferredSeat, cabinLabel }: SeatMapViewProps) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [active, setActive] = useState<string | undefined>(undefined);
  const columns = useMemo(() => columnsOf(layout), [layout]);
  const template = columns.map((c) => (c.kind === 'seat' ? 'var(--seat)' : c.kind === 'wing' ? 'var(--wing)' : 'var(--aisle)')).join(' ');
  const labelColumn = Math.max(1, columns.findIndex((c) => c.kind === 'aisle' || c.kind === 'label') + 1);
  const columnOf = (letter: string) => columns.findIndex((c) => c.kind === 'seat' && c.letter === letter) + 1;

  // Asiento que recibe el foco al entrar con Tab: el que se pidió, el elegido o el primero libre de la cabina.
  const fallback = useMemo(() => {
    const seats = layout.rows.flatMap((r) => r.seats);
    return (
      (preferredSeat && layout.bySeat.has(preferredSeat) ? preferredSeat : undefined) ??
      seats.find((s) => s.available && s.cabin === cabin)?.number ??
      seats[0]?.number
    );
  }, [layout, cabin, preferredSeat]);
  const tabbable = active && layout.bySeat.has(active) ? active : fallback;

  const focus = (seat: SeatCell | undefined) => {
    if (!seat) return;
    setActive(seat.number);
    buttons.current.get(seat.number)?.focus();
  };

  useEffect(() => {
    if (!focusRequest) return;
    const seat = layout.bySeat.get(focusRequest.seat);
    if (!seat) return;
    setActive(seat.number);
    const element = buttons.current.get(seat.number);
    element?.scrollIntoView?.({ block: 'center', inline: 'center' });
    element?.focus();
    // Solo cuando llega una petición nueva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.nonce]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, seat: SeatCell) => {
    const rows = layout.rows;
    const rowIndex = rows.findIndex((r) => r.row === seat.row);
    const row = rows[rowIndex];
    const inRow = (target: SeatRow | undefined) =>
      target?.seats.reduce<SeatCell | undefined>(
        (best, s) => (!best || Math.abs(s.slot - seat.slot) < Math.abs(best.slot - seat.slot) ? s : best),
        undefined,
      );
    const position = row.seats.findIndex((s) => s.number === seat.number);
    let target: SeatCell | undefined;
    switch (event.key) {
      case 'ArrowRight':
        target = row.seats[position + 1];
        break;
      case 'ArrowLeft':
        target = row.seats[position - 1];
        break;
      case 'ArrowDown':
        target = inRow(rows[rowIndex + 1]);
        break;
      case 'ArrowUp':
        target = inRow(rows[rowIndex - 1]);
        break;
      case 'PageDown':
        target = inRow(rows[Math.min(rows.length - 1, rowIndex + 5)]);
        break;
      case 'PageUp':
        target = inRow(rows[Math.max(0, rowIndex - 5)]);
        break;
      case 'Home':
        target = event.ctrlKey ? rows[0].seats[0] : row.seats[0];
        break;
      case 'End':
        target = event.ctrlKey ? rows[rows.length - 1].seats.at(-1) : row.seats.at(-1);
        break;
      default:
        return;
    }
    event.preventDefault();
    focus(target);
  };

  return (
    <div
      role="region"
      aria-label={t.mapRegion}
      className="max-h-[75vh] overflow-auto rounded border-2 border-border bg-background px-4 py-4"
    >
      <p id="seat-map-keys" className="sr-only">
        {t.mapKeys}
      </p>
      <div
        className="mx-auto w-max"
        style={
          {
            '--seat': `${2.75 * zoom}rem`,
            '--aisle': `${2 * zoom}rem`,
            '--wing': '1rem',
          } as CSSProperties
        }
      >
        <div
          aria-hidden="true"
          className="mx-[var(--wing)] flex h-16 items-end justify-center gap-2 rounded-t-[6rem] border-2 border-b-0 border-input bg-primary-tint pb-2 text-sm font-bold text-muted"
        >
          <Plane className="size-4 rotate-[-45deg]" />
          {t.front}
        </div>
        <div role="grid" aria-label={label} aria-describedby="seat-map-keys" className="relative">
          <div aria-hidden="true" className="absolute inset-y-0 left-[var(--wing)] right-[var(--wing)] border-x-2 border-input bg-surface" />
          <div className="relative">
            <Banner icon={<Toilet />}>{t.lavatories}</Banner>
            {layout.cabins.map((cabinModel) => (
              <div key={cabinModel.cabin} role="rowgroup" aria-label={fmt(t.cabinRowGroup, { cabin: cabinLabel(cabinModel.cabin) })}>
                <Banner icon={null} tone="strong">
                  {fmt(t.cabinRowGroup, { cabin: cabinLabel(cabinModel.cabin) })}
                </Banner>
                {cabinModel.rows.map((row, index) => {
                  const showExit = row.exit && !cabinModel.rows[index - 1]?.exit;
                  const showExtra = row.extraSpace && !row.exit && !cabinModel.rows[index - 1]?.extraSpace;
                  const startsWing = row.wing && !cabinModel.rows[index - 1]?.wing;
                  const endsWing = row.wing && !cabinModel.rows[index + 1]?.wing;
                  return (
                    <div key={row.row}>
                      {showExit ? <Banner icon={<DoorOpen />}>{t.exitRow}</Banner> : null}
                      {showExtra ? <Banner icon={<MoveVertical />}>{t.extraRow}</Banner> : null}
                      <div
                        role="row"
                        aria-label={fmt(t.rowLabel, { row: row.row })}
                        className="grid items-center py-px"
                        style={{ gridTemplateColumns: template, columnGap: '2px' }}
                      >
                        <div role="rowheader" aria-label={fmt(t.rowLabel, { row: row.row })} className="text-center text-sm font-bold text-muted" style={{ gridColumn: labelColumn, gridRow: 1 }}>
                          {row.row}
                        </div>
                        {row.wing ? (
                          <>
                            <div aria-hidden="true" className={cn('h-full bg-border', startsWing && 'rounded-tl-md', endsWing && 'rounded-bl-md')} style={{ gridColumn: 1, gridRow: 1 }} />
                            <div aria-hidden="true" className={cn('h-full bg-border', startsWing && 'rounded-tr-md', endsWing && 'rounded-br-md')} style={{ gridColumn: columns.length, gridRow: 1 }} />
                          </>
                        ) : null}
                        {row.seats.map((seat) => {
                          const { state, holder } = stateOf(seat);
                          return (
                            <SeatButton
                              key={seat.number}
                              seat={seat}
                              state={state}
                              holder={holder}
                              matches={matches(seat)}
                              tabbable={seat.number === tabbable}
                              gridColumn={columnOf(seat.letter)}
                              buttonRef={(element) => {
                                if (element) buttons.current.set(seat.number, element);
                                else buttons.current.delete(seat.number);
                              }}
                              onActivate={() => {
                                setActive(seat.number);
                                onSelect(seat);
                              }}
                              onKeyDown={(event) => onKeyDown(event, seat)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <Banner icon={<Toilet />}>{t.lavatories}</Banner>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="mx-[var(--wing)] flex h-8 items-start justify-center rounded-b-[3rem] border-2 border-t-0 border-input bg-primary-tint pt-px text-sm font-bold text-muted"
        >
          {t.rear}
        </div>
      </div>
    </div>
  );
}
