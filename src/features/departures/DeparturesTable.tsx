import type { Departure } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatTime } from '@/shared/lib/format';
import { DepartureStatus } from './DepartureStatus';

const t = es.departures;

/** Hora que se muestra: la que dio la API tal cual (hora local del aeropuerto), sin pasarla por la zona del navegador. */
const hhmm = (iso: string) => formatTime(iso);

/** La estimada solo cuenta si es otro instante que la programada. */
function newTimeOf(d: Departure): string | null {
  if (!d.estimatedTime || Date.parse(d.estimatedTime) === Date.parse(d.scheduledTime)) return null;
  return d.estimatedTime;
}

interface DeparturesTableProps {
  departures: Departure[];
  caption: string;
}

/**
 * Tablero: tabla semántica con `caption` (para el lector de pantalla), letra grande para leerla a distancia y las columnas
 * Hora, Vuelo, Destino, Puerta y Estado. Sin datos de reservas ni de pasajeros.
 */
export function DeparturesTable({ departures, caption }: DeparturesTableProps) {
  return (
    <div className="overflow-x-auto rounded border-2 border-border">
      <table className="w-full min-w-[34rem] border-collapse text-left text-xl md:text-2xl">
        <caption className="border-b-2 border-border bg-surface p-4 text-left text-lg font-bold">{caption}</caption>
        <thead className="bg-primary text-primary-foreground">
          <tr>
            <th scope="col" className="px-4 py-3">{t.columns.time}</th>
            <th scope="col" className="px-4 py-3">{t.columns.flight}</th>
            <th scope="col" className="px-4 py-3">{t.columns.destination}</th>
            <th scope="col" className="px-4 py-3">{t.columns.gate}</th>
            <th scope="col" className="px-4 py-3">{t.columns.status}</th>
          </tr>
        </thead>
        <tbody>
          {departures.map((d) => {
            const next = newTimeOf(d);
            return (
              <tr key={`${d.flightNumber}-${d.scheduledTime}`} className="border-t-2 border-border align-top odd:bg-surface">
                <td className="px-4 py-3 font-bold tabular-nums">
                  <span className={next ? 'line-through decoration-2' : undefined}>{hhmm(d.scheduledTime)}</span>
                  {next ? <span className="block text-base font-bold text-warning">{fmt(t.newTime, { time: hhmm(next) })}</span> : null}
                </td>
                <td className="px-4 py-3">
                  <span className="font-bold">{d.flightNumber}</span>
                  <span className="block text-base text-muted">{d.airline}</span>
                </td>
                <td className="px-4 py-3">
                  {d.destination.city}
                  <span className="block text-base text-muted">{d.destination.code}</span>
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {d.gate ?? t.noGate}
                  {d.terminal ? <span className="block text-base text-muted">{fmt(t.terminal, { terminal: d.terminal })}</span> : null}
                </td>
                <td className="px-4 py-3">
                  <DepartureStatus status={d.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
