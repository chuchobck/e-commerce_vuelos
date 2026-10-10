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
  /** "Abre el … y cierra el …" en hora local del aeropuerto de salida (del vuelo que importa ahora). */
  windowText: string;
}

/**
 * ¿Se puede hacer el check-in de esta reserva ahora? La API no dice si el check-in ya se hizo ni expone la ventana
 * (DISCREPANCIA): se deriva del estado y de la regla de 48 h a 60 min antes DE CADA VUELO (leído en el backend: la ventana
 * es por vuelo, así que una reserva de ida y vuelta puede hacer el check-in de la ida y, días después, el de la vuelta).
 * Hay check-in si algún vuelo está dentro de su ventana; si no, se explica cuándo abre el próximo.
 */
export function checkInAvailability(booking: Booking, now: Date = new Date()): CheckInAvailability {
  const segments = [booking.outbound, booking.inbound].flatMap((leg) => leg?.itinerary.segments ?? []);
  const windows = segments.map((segment) => ({ segment, window: checkInWindow(segment.departureTime, now) }));
  const open = windows.find((w) => w.window.status === 'open');
  const upcoming = windows.find((w) => w.window.status === 'not-open');
  const focus = open ?? upcoming ?? windows[windows.length - 1];
  const at = (iso: string) => `${formatLongDate(iso)} a las ${formatTime(iso)}`;

  let windowText = '';
  if (focus) {
    const departure = new Date(focus.segment.departureTime).getTime();
    const opens = toAirportLocalIso(new Date(departure - 48 * 3_600_000).toISOString(), focus.segment.origin);
    const closes = toAirportLocalIso(new Date(departure - 60 * 60_000).toISOString(), focus.segment.origin);
    const times = { opens: at(opens), closes: at(closes) };
    windowText = segments.length > 1 ? fmt(c.windowFlight, { flight: focus.segment.flightNumber, ...times }) : fmt(c.window, times);
  }

  if (booking.status === 'CANCELLED') return { available: false, reason: c.tripCancelled, windowText };
  if (booking.status !== 'CONFIRMED') return { available: false, reason: c.notConfirmed, windowText };
  if (open) return { available: true, windowText };
  if (upcoming && upcoming.window.status === 'not-open') {
    return { available: false, reason: fmt(c.opensAt, { date: formatLongDate(upcoming.window.opensAtLocal), time: formatTime(upcoming.window.opensAtLocal) }), windowText };
  }
  const allDeparted = windows.every((w) => new Date(w.segment.departureTime).getTime() <= now.getTime());
  return { available: false, reason: allDeparted ? c.departed : c.closed, windowText };
}
