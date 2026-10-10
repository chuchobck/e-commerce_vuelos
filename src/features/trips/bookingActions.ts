import type { Booking, BookingStatus } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { checkInAvailability } from '@/shared/lib/checkinStatus';
import { fareName } from '@/shared/lib/format';

const t = es.aftersale.actions;

export type TripAction = 'checkIn' | 'passes' | 'baggage' | 'dateChange' | 'cancel';

export interface ActionState {
  /** Se muestra. Los trámites que no corresponden a una reserva terminada (cancelada, fallida) no se muestran. */
  visible: boolean;
  /** Se puede usar ahora. Si no, `reason` dice por qué (se escribe junto al botón desactivado). */
  enabled: boolean;
  reason?: string;
}

export type TripActions = Record<TripAction, ActionState>;

/** Estados en los que hay un trámite a medias: no se permite empezar otro hasta que termine. */
const IN_PROGRESS: readonly BookingStatus[] = ['PENDING', 'PENDING_PAYMENT', 'TICKET_ISSUING', 'CHANGE_PENDING', 'CANCELLATION_PENDING'];
const ENDED: readonly BookingStatus[] = ['CANCELLED', 'FAILED'];

const hidden: ActionState = { visible: false, enabled: false };

/**
 * Qué trámites de postventa se ofrecen y cuáles se pueden usar, a partir de lo que la API dice de la reserva:
 * su estado, la salida del primer vuelo y las reglas de cada familia (`changeable`).
 *
 * DISCREPANCIA: la API no expone qué acciones son válidas; esto es lo que se asume de los campos que sí da.
 *  - Una reserva cancelada o fallida no admite nada.
 *  - Con un trámite en proceso (pago pendiente, cambio o cancelación en curso) todo queda desactivado.
 *  - Solo una reserva CONFIRMADA admite check-in, equipaje, cambio y cancelación.
 *  - Con el primer vuelo ya salido solo se pueden ver los pases.
 *  - El cambio de fecha pide que todas las familias del viaje sean cambiables (`fare.changeable`).
 *  - La API no dice si el check-in ya se hizo: «Pases de abordar» queda siempre disponible y la pantalla explica
 *    si todavía no hay pases.
 */
export function bookingActions(booking: Booking, now: Date = new Date()): TripActions {
  if (ENDED.includes(booking.status)) {
    return { checkIn: hidden, passes: hidden, baggage: hidden, dateChange: hidden, cancel: hidden };
  }
  const blocked = (reason: string): ActionState => ({ visible: true, enabled: false, reason });
  if (IN_PROGRESS.includes(booking.status)) {
    const reason = booking.status === 'PENDING_PAYMENT' || booking.status === 'PENDING' || booking.status === 'TICKET_ISSUING' ? t.notConfirmed : t.inProgress;
    return { checkIn: blocked(reason), passes: blocked(reason), baggage: blocked(reason), dateChange: blocked(reason), cancel: blocked(reason) };
  }

  const departed = new Date(booking.outbound.itinerary.segments[0].departureTime).getTime() <= now.getTime();
  const check = checkInAvailability(booking, now);
  const ok: ActionState = { visible: true, enabled: true };
  const afterDeparture = departed ? blocked(t.departed) : ok;

  const legs = [booking.outbound, booking.inbound].filter((leg): leg is NonNullable<typeof leg> => !!leg);
  const unchangeable = legs.find((leg) => !leg.fare.changeable);
  const hasSeated = booking.passengers.some((p) => p.type !== 'INFANT');

  return {
    checkIn: check.available ? ok : { visible: true, enabled: false, reason: check.reason },
    passes: ok,
    baggage: !hasSeated ? blocked(t.noActions) : afterDeparture,
    dateChange: departed ? blocked(t.departed) : unchangeable ? blocked(fmt(t.notChangeable, { fare: fareName(unchangeable.fare.brand) })) : ok,
    cancel: afterDeparture,
  };
}
