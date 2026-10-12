import type { FlightStatus } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';

const t = es.aftersale.flight;

/** Minutos de retraso de la salida: hora estimada menos programada (0 si no hay estimación o sale antes). */
export function delayMinutes(status: Pick<FlightStatus, 'departure'>): number {
  const { scheduled, estimated } = status.departure;
  if (!estimated) return 0;
  return Math.max(0, Math.round((new Date(estimated).getTime() - new Date(scheduled).getTime()) / 60_000));
}

export type FlightTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

/** Lo que se muestra de un vuelo en su insignia: "A tiempo", "Retrasado 45 min", "Cancelado"… con el tono que le toca. */
export function flightBadge(status: Pick<FlightStatus, 'status' | 'departure'>): { label: string; tone: FlightTone } {
  const delay = delayMinutes(status);
  switch (status.status) {
    case 'CANCELLED':
      return { label: t.cancelled, tone: 'error' };
    case 'DIVERTED':
      return { label: t.diverted, tone: 'warning' };
    case 'ARRIVED':
      return { label: t.arrived, tone: 'success' };
    case 'DEPARTED':
      return { label: t.departed, tone: 'info' };
    case 'BOARDING':
      return { label: t.boarding, tone: 'info' };
    case 'DELAYED':
      return { label: delay > 0 ? fmt(t.delayed, { minutes: delay }) : t.delayedUnknown, tone: 'warning' };
    default:
      // Programado con una estimación posterior también es un retraso, aunque la API no lo marque como DELAYED.
      return delay > 0 ? { label: fmt(t.delayed, { minutes: delay }), tone: 'warning' } : { label: t.onTime, tone: 'success' };
  }
}
