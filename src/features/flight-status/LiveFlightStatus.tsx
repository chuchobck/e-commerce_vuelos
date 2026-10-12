import { RefreshCw } from 'lucide-react';
import { es, fmt } from '@/shared/i18n';
import { formatTime } from '@/shared/lib/format';
import { Alert, Button, LoadingState } from '@/shared/ui';
import { FlightStatusBadge } from './FlightStatusBadge';
import { useLiveFlightStatus } from './useLiveFlightStatus';

const t = es.aftersale.flight;

interface LiveFlightStatusProps {
  flightNumber: string;
  /** Fecha local de salida (yyyy-MM-dd). */
  date: string;
  /** "UIO → GYE": ayuda a distinguir los tramos en un viaje con escala o con vuelta. */
  route: string;
}

/**
 * Estado de un tramo del viaje: insignia (a tiempo / retrasado N min / cancelado…), horas programada y estimada,
 * botón para actualizar y aviso (aria-live) del resultado. Si no se puede consultar, la reserva no se afecta.
 */
export function LiveFlightStatus({ flightNumber, date, route }: LiveFlightStatusProps) {
  const live = useLiveFlightStatus(flightNumber, date);
  const label = fmt(t.legLabel, { flight: flightNumber, route });
  const data = live.data;

  return (
    <div className="flex flex-col gap-4 rounded border-2 border-border bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-xl">{label}</h3>
        {data ? <FlightStatusBadge status={data} /> : null}
      </div>

      {live.status === 'loading' ? <LoadingState label={t.loading} /> : null}
      {live.status === 'error' ? (
        <Alert variant="warning" live="polite">
          <p>{t.unavailable}</p>
        </Alert>
      ) : null}
      {data ? (
        <dl className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="font-bold">
              {t.departure} · {data.departure.airport}
            </dt>
            <dd>
              {fmt(t.scheduled, { time: formatTime(data.departure.scheduled) })}
              {data.departure.estimated ? <span className="font-bold"> · {fmt(t.estimated, { time: formatTime(data.departure.estimated) })}</span> : null}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="font-bold">
              {t.arrival} · {data.arrival.airport}
            </dt>
            <dd>
              {fmt(t.scheduled, { time: formatTime(data.arrival.scheduled) })}
              {data.arrival.estimated ? <span className="font-bold"> · {fmt(t.estimated, { time: formatTime(data.arrival.estimated) })}</span> : null}
            </dd>
          </div>
        </dl>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="secondary" onClick={live.refresh} loading={live.refreshing && live.status !== 'loading'} loadingText={t.refreshing} aria-label={`${t.refresh}: ${flightNumber}`}>
          <RefreshCw aria-hidden="true" />
          {t.refresh}
        </Button>
        <p role="status" className="text-sm text-muted">
          {live.updatedAt ? fmt(t.updatedAt, { time: new Date(live.updatedAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' }) }) : null}
        </p>
      </div>
    </div>
  );
}
