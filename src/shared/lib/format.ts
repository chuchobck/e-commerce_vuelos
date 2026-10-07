import { format } from 'date-fns';
import { dateLocale, parseIsoDate } from './dates';
import type { Money } from './money';
import { es } from '@/shared/i18n';

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Único formato de dinero de la interfaz (es-EC), p. ej. "$94,38". Recibe centavos enteros:
 * la división se hace solo para mostrar, nunca para calcular.
 */
export function formatMoney(m: Money): string {
  let f = formatters.get(m.currency);
  if (!f) {
    f = new Intl.NumberFormat('es-EC', { style: 'currency', currency: m.currency, minimumFractionDigits: 2 });
    formatters.set(m.currency, f);
  }
  return f.format(m.cents / 100);
}

/** "lun., 12 de octubre de 2026" */
export function formatLongDate(iso: string): string {
  const date = parseIsoDate(iso.slice(0, 10));
  return date ? format(date, "EEEE d 'de' MMMM 'de' yyyy", { locale: dateLocale }) : iso;
}

/** "12 oct." */
export function formatShortDate(iso: string): string {
  const date = parseIsoDate(iso.slice(0, 10));
  return date ? format(date, "d 'de' MMM", { locale: dateLocale }) : iso;
}

/** Hora local del aeropuerto "07:45" tomada del ISO (que ya incluye el desfase del aeropuerto). */
export function formatTime(isoDateTime: string): string {
  const match = /T(\d{2}:\d{2})/.exec(isoDateTime);
  return match ? match[1] : format(new Date(isoDateTime), 'HH:mm');
}

/** "1 h 05 min" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

/** "mm:ss" para el temporizador. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Nombre visible de una familia tarifaria. Código desconocido: "PREMIUM_PLUS" → "Premium Plus". */
export function fareName(brand: string): string {
  return es.fares[brand] ?? brand.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
