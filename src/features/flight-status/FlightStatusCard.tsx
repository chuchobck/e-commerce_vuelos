import type { FlightStatus, FlightStatusCode, FlightStatusPoint } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatLongDate, formatTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui';

const t = es.status;

const TONE: Record<FlightStatusCode, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  SCHEDULED: 'neutral',
  BOARDING: 'info',
  DEPARTED: 'info',
  DELAYED: 'warning',
  ARRIVED: 'success',
  CANCELLED: 'error',
  DIVERTED: 'warning',
};

interface FlightStatusCardProps {
  status: FlightStatus;
  /** Nivel del título según la jerarquía de la página. */
  headingLevel?: 'h2' | 'h3';
}

function TimeRow({ title, point }: { title: string; point: FlightStatusPoint }) {
  return (
    <div className="flex flex-col gap-2 rounded border-2 border-border p-4">
      <dt className="font-bold">
        {title} · {point.airport}
        {point.terminal ? <span className="font-normal text-muted"> · {fmt(t.terminal, { terminal: point.terminal })}</span> : null}
      </dt>
      <dd className="flex flex-col">
        <span>
          {t.scheduledTime}: <span className="font-bold tabular-nums">{formatTime(point.scheduled)}</span>
        </span>
        <span>
          {t.estimatedTime}:{' '}
          <span className="font-bold tabular-nums">{point.estimated ? formatTime(point.estimated) : t.noEstimate}</span>
        </span>
        {point.actual ? (
          <span>
            {t.actualTime}: <span className="font-bold tabular-nums">{formatTime(point.actual)}</span>
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/** Estado de un vuelo: insignia (texto, no solo color), ruta y horas en hora local de cada aeropuerto. */
export function FlightStatusCard({ status, headingLevel: Heading = 'h3' }: FlightStatusCardProps) {
  return (
    <article role="status" className="flex flex-col gap-6 rounded border-2 border-border bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Heading className="text-xl">
          {fmt(t.resultHeading, { flight: status.flightNumber, date: formatLongDate(status.date) })}
        </Heading>
        <Badge tone={TONE[status.status]}>{t.states[status.status]}</Badge>
      </div>
      <p className="text-lg font-bold">
        {fmt(es.results.route, { origin: status.departure.airport, destination: status.arrival.airport })}
      </p>
      <dl className="grid gap-4 sm:grid-cols-2">
        <TimeRow title={t.departure} point={status.departure} />
        <TimeRow title={t.arrival} point={status.arrival} />
      </dl>
    </article>
  );
}
