import type { Booking } from '@/shared/api';
import { toAirportLocalIso } from '@/shared/api/mapping';
import { es, fmt } from '@/shared/i18n';
import { checkInWindow } from './checkin';
import { formatLongDate, formatTime } from './format';

const c = es.aftersale.checkin;

export interface CheckInAvailability {
  available: boolean;
  /** Por qué no se puede ahora (y cuándo abre), para mostrarlo junto al botón desactivado. */
  reason?: string;
  /** "Abre el … y cierra el …" en hora local del aeropuerto de salida. */
  windowText: string;
}

/**
 * ¿Se puede hacer el check-in de esta reserva ahora? La API no dice si el check-in ya se hizo ni expone la ventana
 * (DISCREPANCIA): se deriva del estado, de la salida del primer vuelo y de la regla de 48 h a 60 min antes.
 */
export function checkInAvailability(booking: Booking, now: Date = new Date()): CheckInAvailability {
  const segment = booking.outbound.itinerary.segments[0];
  const window = checkInWindow(segment.departureTime, now);
  const departure = new Date(segment.departureTime).getTime();
  const opens = toAirportLocalIso(new Date(departure - 48 * 3_600_000).toISOString(), segment.origin);
  const closes = toAirportLocalIso(new Date(departure - 60 * 60_000).toISOString(), segment.origin);
  const at = (iso: string) => `${formatLongDate(iso)} a las ${formatTime(iso)}`;
  const windowText = fmt(c.window, { opens: at(opens), closes: at(closes) });

  if (booking.status === 'CANCELLED') return { available: false, reason: c.tripCancelled, windowText };
  if (booking.status !== 'CONFIRMED') return { available: false, reason: c.notConfirmed, windowText };
  if (departure <= now.getTime()) return { available: false, reason: c.departed, windowText };
  if (window.status === 'not-open') {
    return { available: false, reason: fmt(c.opensAt, { date: formatLongDate(window.opensAtLocal), time: formatTime(window.opensAtLocal) }), windowText };
  }
  if (window.status === 'closed') return { available: false, reason: c.closed, windowText };
  return { available: true, windowText };
}
