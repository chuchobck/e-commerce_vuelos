import type { ReactNode } from 'react';
import { es } from '@/shared/i18n';
import { formatUSD } from '@/shared/lib/format';
import { Card, CardTitle, TripSummary } from '@/shared/ui';
import type { SelectedLeg } from './selection';

const p = es.purchase;

interface CheckoutSummaryProps {
  outbound: SelectedLeg;
  inbound?: SelectedLeg;
  total: number;
  /** El precio ya está apartado con un hold activo. */
  held: boolean;
  /** Acciones bajo el total (p. ej. cancelar el hold). */
  children?: ReactNode;
}

/** Resumen del viaje y total a pagar, igual en los pasos 2 y 3. */
export function CheckoutSummary({ outbound, inbound, total, held, children }: CheckoutSummaryProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardTitle className="mb-6">{p.summaryTitle}</CardTitle>
        <TripSummary outbound={outbound} inbound={inbound} />
      </Card>
      <Card className="flex flex-col gap-4">
        {held ? (
          <>
            <CardTitle>{p.holdTitle}</CardTitle>
            <p className="text-muted">{p.holdText}</p>
          </>
        ) : null}
        <p className="flex flex-col">
          <span className="text-sm text-muted">{p.totalLabel}</span>
          <span className="text-3xl font-bold tabular-nums">{formatUSD(total)}</span>
        </p>
        {children}
      </Card>
    </div>
  );
}
