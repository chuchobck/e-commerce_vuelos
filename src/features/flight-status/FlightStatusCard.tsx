import type { FlightStatus, FlightStatusCode } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatLongDate, formatTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui';

const t = es.status;

const TONE: Record<FlightStatusCode, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  SCHEDULED: 'neutral',
  ON_TIME: 'success',
  DELAYED: 'warning',
  BOARDING: 'info',
  DEPARTED: 'info',
  LANDED: 'success',
  CANCELLED: 'error',
};

interface FlightStatusCardProps {
  status: FlightStatus;
  /** Nivel del título según la jerarquía de la página. */
  headingLevel?: 'h2' | 'h3';
}

/** Estado de un vuelo: insignia (texto, no solo color), ruta, horas programadas y estimadas, puerta. */
export function FlightStatusCard({ status, headingLevel: Heading = 'h3' }: FlightStatusCardProps) {
  return (
    <article role="status" className="flex flex-col gap-6 rounded border-2 border-border bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Heading className="text-xl">
          {fmt(t.resultHeading, { flight: status.flightNumber, date: formatLongDate(status.date) })}
        </Heading>
        <Badge tone={TONE[status.status]}>{t.states[status.status]}</Badge>
      </div>
      <p className="text-lg font-bold">{fmt(es.results.route, { origin: status.origin, destination: status.destination })}</p>
      <dl className="grid gap-4 sm:grid-cols-2">
        {[
          { title: t.departure, scheduled: status.scheduledDeparture, estimated: status.estimatedDeparture },
          { title: t.arrival, scheduled: status.scheduledArrival, estimated: status.estimatedArrival },
        ].map((row) => (
          <div key={row.title} className="flex flex-col gap-2 rounded border-2 border-border p-4">
            <dt className="font-bold">{row.title}</dt>
            <dd className="flex flex-col">
              <span>
                {t.scheduledTime}: <span className="font-bold tabular-nums">{formatTime(row.scheduled)}</span>
              </span>
              <span>
                {t.estimatedTime}: <span className="font-bold tabular-nums">{formatTime(row.estimated)}</span>
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-muted">
        {status.gate ? `${fmt(t.gate, { gate: status.gate })} · ` : ''}
        {fmt(t.updated, {
          time: new Date(status.updatedAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }),
        })}
      </p>
    </article>
  );
}
