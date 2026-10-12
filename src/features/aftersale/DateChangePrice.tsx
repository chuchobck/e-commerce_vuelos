import { ArrowUpCircle, CircleCheck, Info } from 'lucide-react';
import type { DateChangePrice as Price } from '@/shared/api';
import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';
import { formatMoney } from '@/shared/lib/format';
import { cheaperThanCurrent, priceDirection } from './dateChange';

const t = es.aftersale.dateChange;

/** Diferencia de precio de un cambio: desglose (+/−) y el total destacado con icono y texto: «Pagas» o «Sin costo». */
export function DateChangePrice({ price }: { price: Price }) {
  const direction = priceDirection(price);
  const rows: [string, Price['fare']][] = [
    [t.fare, price.fare],
    [t.taxes, price.taxes],
    [t.fee, price.fee],
  ];
  const signed = (cents: number, text: string) => (cents > 0 ? `+${text}` : text);
  const Icon = direction === 'pay' ? ArrowUpCircle : CircleCheck;

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-1 text-sm">
        {rows.map(([label, money]) => (
          <div key={label} className="flex items-baseline justify-between gap-4">
            <dt className="text-muted">{label}</dt>
            <dd className="tabular-nums">{signed(money.cents, formatMoney(money))}</dd>
          </div>
        ))}
      </dl>
      <p
        className={cn(
          'flex items-center justify-between gap-4 rounded border-2 p-4 text-xl font-bold',
          direction === 'pay' && 'border-warning bg-warning-tint',
          direction === 'free' && 'border-border bg-background',
        )}
      >
        <span className="flex items-center gap-2">
          <Icon aria-hidden="true" className="size-6" />
          {direction === 'pay' ? t.toPay : t.nothing}
        </span>
        {direction === 'free' ? null : <span className="tabular-nums">{formatMoney(price.total)}</span>}
      </p>
      {cheaperThanCurrent(price) ? (
        <p className="flex items-start gap-2 text-sm text-muted">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{t.noRefundNote}</span>
        </p>
      ) : null}
    </div>
  );
}
