import type { BoardingPass } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatLongDate, formatTime } from '@/shared/lib/format';

const c = es.checkin;

/** Pase de abordar de un pasajero. El nivel h3 asume que la lista va bajo un h2. */
export function BoardingPassCard({ pass }: { pass: BoardingPass }) {
  return (
    <article className="flex flex-col gap-4 rounded border-2 border-primary bg-surface p-6 shadow-card">
      <h3 className="text-xl">{fmt(c.boardingPass, { name: pass.passengerName })}</h3>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt className="text-sm text-muted">{c.flight}</dt>
          <dd className="text-lg font-bold">{pass.flightNumber}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">{c.departure}</dt>
          <dd className="text-lg font-bold">
            {pass.origin} → {pass.destination}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">{c.gate}</dt>
          <dd className="text-lg font-bold">{pass.gate}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">{c.seat}</dt>
          <dd className="text-lg font-bold">{pass.seat}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">{c.boarding}</dt>
          <dd className="text-lg font-bold tabular-nums">{formatTime(pass.boardingTime)}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">{c.group}</dt>
          <dd className="text-lg font-bold">{pass.group}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-sm text-muted">{c.departure}</dt>
          <dd className="text-lg font-bold">
            {formatLongDate(pass.departureTime)} · {formatTime(pass.departureTime)}
          </dd>
        </div>
      </dl>
      <p className="break-all text-sm text-muted">{pass.barcode}</p>
    </article>
  );
}
