import { CalendarCheck, CalendarClock, CheckCircle2, Lock, PlaneTakeoff, type LucideIcon } from 'lucide-react';
import { es, fmt } from '@/shared/i18n';
import type { SegmentCheckInStatus } from '@/shared/lib/checkin';
import type { FlightCheckIn } from '@/shared/lib/checkinStatus';
import { formatShortDate, formatTime } from '@/shared/lib/format';
import { Badge } from '@/shared/ui';

const t = es.aftersale.checkin.status;

const LOOK: Record<SegmentCheckInStatus, { tone: 'success' | 'warning' | 'info' | 'neutral'; icon: LucideIcon }> = {
  'no-abre-aun': { tone: 'neutral', icon: CalendarClock },
  abierto: { tone: 'info', icon: CalendarCheck },
  hecho: { tone: 'success', icon: CheckCircle2 },
  cerrado: { tone: 'warning', icon: Lock },
  salio: { tone: 'neutral', icon: PlaneTakeoff },
};

/** El texto de la etiqueta: el estado dicho con palabras (nunca solo con color), con el asiento o cuándo abre. */
function checkInStatusText(flight: FlightCheckIn): string {
  if (flight.status === 'no-abre-aun') {
    return fmt(t['no-abre-aun'], { date: formatShortDate(flight.opensAtLocal), time: formatTime(flight.opensAtLocal) });
  }
  if (flight.status === 'hecho') {
    const seats = [...new Set(flight.seats.map((s) => s.seat).filter((s): s is string => !!s))];
    if (seats.length === 0) return t.hecho;
    return fmt(seats.length === 1 ? t.hechoSeat : t.hechoSeats, { seats: seats.join(', ') });
  }
  return t[flight.status];
}

/**
 * Etiqueta del estado del check-in de un vuelo: icono (decorativo) + texto, que es lo que lee el lector de pantalla. No es una
 * región viva: el cambio después de confirmar lo anuncia el conteo de `CheckInFlights` (role="status").
 */
export function CheckInStatusBadge({ flight }: { flight: FlightCheckIn }) {
  const { tone, icon } = LOOK[flight.status];
  return (
    <Badge tone={tone} icon={icon}>
      {checkInStatusText(flight)}
    </Badge>
  );
}
