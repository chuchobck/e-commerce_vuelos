import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { es, fmt } from '@/shared/i18n';
import type { BookingPassenger, Money, PassengerCount } from '@/shared/api';
import { formatMoney } from '@/shared/lib/format';
import { useMediaQuery } from '@/shared/lib/useMediaQuery';
import { Button, Card, CardTitle, ConfirmDialog, TripSummary } from '@/shared/ui';
import { HoldTimer } from './HoldTimer';
import { holdOf, type CheckoutState } from './machine';
import { anySeatChosen, seatLines } from './seatLines';
import { selectionTotal, type CheckoutSelection } from './selection';

const p = es.purchase;
const f = es.checkoutForms;

/** "1 adulto · 2 niños · 1 infante". */
export function passengersLine(count: PassengerCount): string {
  const part = (n: number, [one, many]: readonly [string, string]) => (n > 0 ? [fmt(n === 1 ? one : many, { n })] : []);
  return [...part(count.adults, f.countAdults), ...part(count.children, f.countChildren), ...part(count.infants, f.countInfants)].join(' · ');
}

function PriceRow({ label, money, strong }: { label: string; money: Money; strong?: boolean }) {
  return (
    <div className={strong ? 'flex items-baseline justify-between gap-4 text-xl font-bold' : 'flex items-baseline justify-between gap-4 text-muted'}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{formatMoney(money)}</dd>
    </div>
  );
}

interface CheckoutAsideProps {
  selection: CheckoutSelection;
  state: CheckoutState;
  /** Pasajeros escritos hasta ahora (el borrador): de ahí salen los asientos elegidos. */
  passengers?: BookingPassenger[];
  /** "Cancelar compra": libera el hold y vuelve a los resultados. */
  onCancel: () => Promise<void>;
}

/**
 * Panel lateral de la compra: temporizador, resumen (vuelo, tarifa, pasajeros y precio congelado
 * con su desglose si la API lo da) y "Cancelar compra". En móvil va arriba y el resumen se pliega;
 * el temporizador siempre está a la vista.
 */
export function CheckoutAside({ selection, state, passengers = [], onCancel }: CheckoutAsideProps) {
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const hold = holdOf(state);
  const total = hold?.lockedPrice ?? selectionTotal(selection);
  const lines = seatLines(passengers, selection.outbound, selection.inbound);

  return (
    <aside aria-label={p.summaryTitle} className="flex flex-col gap-4">
      <HoldTimer state={state} />
      <Card className="p-0">
        <details open={desktop || open} onToggle={(e) => setOpen(e.currentTarget.open)}>
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-6 py-3 lg:hidden [&::-webkit-details-marker]:hidden">
            <span className="flex flex-col">
              <span className="font-bold">{p.summaryTitle}</span>
              <span className="text-sm text-muted tabular-nums">{fmt(p.summaryCollapsed, { total: formatMoney(total) })}</span>
            </span>
            <ChevronDown aria-hidden="true" className={open ? 'size-6 rotate-180' : 'size-6'} />
          </summary>
          <div className="flex flex-col gap-6 p-6">
            <CardTitle className="hidden lg:block">{p.summaryTitle}</CardTitle>
            <TripSummary outbound={selection.outbound} inbound={selection.inbound} />
            <p>
              <span className="font-bold">{f.passengersLabel}: </span>
              {passengersLine(selection.passengers)}
            </p>
            {anySeatChosen(lines) ? (
              <div className="flex flex-col gap-1 text-sm">
                <p className="font-bold">{f.seatsTitle}</p>
                <ul className="flex flex-col gap-1 text-muted">
                  {lines.map((l) => (
                    <li key={l.passengerId}>
                      <span className="font-bold text-foreground">{l.name}:</span> {l.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted">
                <span className="font-bold text-foreground">{f.seat}:</span> {f.seatAuto}
              </p>
            )}
            <dl className="flex flex-col gap-2 border-t-2 border-border pt-4">
              {hold?.fareBreakdown ? (
                <>
                  <PriceRow label={f.fareBase} money={hold.fareBreakdown.base} />
                  <PriceRow label={f.taxes} money={hold.fareBreakdown.taxes} />
                </>
              ) : null}
              <PriceRow label={hold ? p.totalHeld : p.totalLabel} money={total} strong />
            </dl>
            {hold ? <p className="text-sm text-muted">{p.holdText}</p> : null}
          </div>
        </details>
      </Card>
      <Button variant="ghost" onClick={() => setConfirm(true)}>
        {p.cancelPurchase}
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={p.cancelHoldConfirmTitle}
        description={p.cancelHoldConfirmText}
        confirmLabel={p.cancelHoldConfirm}
        cancelLabel={p.cancelHoldKeep}
        loading={cancelling}
        destructive
        onConfirm={() => {
          setCancelling(true);
          void onCancel().finally(() => {
            setCancelling(false);
            setConfirm(false);
          });
        }}
      />
    </aside>
  );
}
