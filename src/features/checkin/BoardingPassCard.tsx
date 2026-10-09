import type { ReactNode } from 'react';
import type { BoardingPass, Segment } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatLongDate, formatTime } from '@/shared/lib/format';
import { QrCode } from '@/shared/ui/qr-code';

const t = es.aftersale.passes;

interface BoardingPassCardProps {
  pass: BoardingPass;
  passengerName: string;
  /** El tramo del pase (de la reserva). Sin él, solo se muestra lo que dio la API. */
  segment?: Segment;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-lg font-bold">{children}</dd>
    </div>
  );
}

/**
 * Pase de abordar de un pasajero en un tramo. Muestra solo lo que entrega la API (asiento, grupo, posición y el texto del
 * código) más lo que la reserva sabe del vuelo. El QR se dibuja con el texto del código tal cual. Pensado para imprimirse:
 * no se parte entre páginas. El nivel h2 asume que la página tiene un h1.
 */
export function BoardingPassCard({ pass, passengerName, segment }: BoardingPassCardProps) {
  const flight = segment?.flightNumber ?? '';
  return (
    <article
      aria-labelledby={`pass-${pass.passengerId}-${pass.segmentId.replace(/[^A-Za-z0-9_-]/g, '')}`}
      className="flex flex-col gap-6 rounded border-2 border-primary bg-surface p-6 shadow-card print:break-inside-avoid print:shadow-none sm:flex-row sm:items-start"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <h2 id={`pass-${pass.passengerId}-${pass.segmentId.replace(/[^A-Za-z0-9_-]/g, '')}`} className="text-xl">
          {fmt(t.passFor, { name: passengerName })}
        </h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {segment ? (
            <>
              <Field label={t.flight}>{segment.flightNumber}</Field>
              <Field label={t.route}>
                {segment.origin} → {segment.destination}
              </Field>
              <Field label={t.departure}>
                <span className="tabular-nums">
                  {formatLongDate(segment.departureTime)} · {formatTime(segment.departureTime)}
                </span>
              </Field>
            </>
          ) : null}
          <Field label={t.seat}>{pass.seat || t.notGiven}</Field>
          <Field label={t.group}>{pass.boardingGroup ?? t.notGiven}</Field>
          <Field label={t.position}>{pass.boardingPosition ?? t.notGiven}</Field>
        </dl>
        <p className="break-all text-sm text-muted">
          <span className="font-bold">{t.codeRaw}:</span> {pass.barcode}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-2 self-center">
        <QrCode value={pass.barcode} label={fmt(t.codeLabel, { name: passengerName, flight })} />
        {pass.barcodeType !== 'QR' ? <p className="max-w-48 text-center text-sm text-muted">{fmt(t.codeAs, { type: pass.barcodeType })}</p> : null}
      </div>
    </article>
  );
}
