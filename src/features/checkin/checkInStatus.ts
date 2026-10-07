import type { Booking } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { checkInWindow } from '@/shared/lib/checkin';
import { formatLongDate, formatTime } from '@/shared/lib/format';

const c = es.checkin;

/**
 * ¿Se puede hacer el check-in de esta reserva ahora? Si no, `reason` explica por qué
 * (y cuándo abre), para mostrarlo junto al botón deshabilitado.
 */
export function checkInStatus(booking: Booking, now: Date = new Date()): { available: boolean; reason?: string } {
  if (booking.status === 'CANCELLED') return { available: false, reason: c.tripCancelled };
  if (booking.status === 'CHECKED_IN') return { available: false, reason: c.done };
  const checkin = checkInWindow(booking.outbound.itinerary.segments[0].departureTime, now);
  if (checkin.status === 'not-open') {
    return {
      available: false,
      reason: fmt(c.opensAt, { date: formatLongDate(checkin.opensAtLocal), time: formatTime(checkin.opensAtLocal) }),
    };
  }
  if (checkin.status === 'closed') return { available: false, reason: c.closed };
  return { available: true };
}
