import type { BoardingPass, Booking, BookingStatus } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { bookingCheckIn } from '@/shared/lib/checkinStatus';
import { fareName } from '@/shared/lib/format';

const t = es.aftersale.actions;

export type TripAction = 'checkIn' | 'passes' | 'baggage' | 'dateChange' | 'cancel';

export interface ActionState {
  /** Se muestra. Los trámites que no corresponden a una reserva terminada (cancelada, fallida) no se muestran. */
  visible: boolean;
  /** Se puede usar ahora. Si no, `reason` dice por qué (junto al botón desactivado, o en su lugar si no se muestra). */
  enabled: boolean;
  reason?: string;
  /** Es el botón principal de la reserva (solo «Ver pases de abordar» cuando ya hay pases; si no, lo es el check-in). */
  primary?: boolean;
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
 *  - Qué vuelos ya tienen check-in sale de sus pases de abordar (GET .../boarding-passes, `passes`). Con algún pase,
 *    «Ver pases de abordar» es el botón principal; «Hacer check-in» solo se ofrece si queda algún vuelo `abierto` sin
 *    hacer, y si no, no hay botón y `reason` explica por qué (ya hecho, cerrado, salió o cuándo abre).
 *  - Sin `passes` (la consulta falló o no se pidió) no se sabe qué está hecho: el check-in se ofrece solo por la ventana
 *    y, fuera de ella, queda desactivado con su motivo; «Pases de abordar» queda disponible y la pantalla lo explica.
 */
export function bookingActions(booking: Booking, now: Date = new Date(), passes?: readonly BoardingPass[]): TripActions {
  if (ENDED.includes(booking.status)) {
    return { checkIn: hidden, passes: hidden, baggage: hidden, dateChange: hidden, cancel: hidden };
  }
  const blocked = (reason: string): ActionState => ({ visible: true, enabled: false, reason });
  if (IN_PROGRESS.includes(booking.status)) {
    const reason = booking.status === 'PENDING_PAYMENT' || booking.status === 'PENDING' || booking.status === 'TICKET_ISSUING' ? t.notConfirmed : t.inProgress;
    return { checkIn: blocked(reason), passes: blocked(reason), baggage: blocked(reason), dateChange: blocked(reason), cancel: blocked(reason) };
  }

  const departed = new Date(booking.outbound.itinerary.segments[0].departureTime).getTime() <= now.getTime();
  const check = bookingCheckIn(booking, passes, now);
  const ok: ActionState = { visible: true, enabled: true };
  const afterDeparture = departed ? blocked(t.departed) : ok;

  const legs = [booking.outbound, booking.inbound].filter((leg): leg is NonNullable<typeof leg> => !!leg);
  const unchangeable = legs.find((leg) => !leg.fare.changeable);
  const hasSeated = booking.passengers.some((p) => p.type !== 'INFANT');

  return {
    checkIn: check.available ? ok : { visible: !check.known, enabled: false, reason: check.reason },
    passes: check.hasPasses ? { ...ok, primary: true } : ok,
    baggage: !hasSeated ? blocked(t.noActions) : afterDeparture,
    dateChange: departed ? blocked(t.departed) : unchangeable ? blocked(fmt(t.notChangeable, { fare: fareName(unchangeable.fare.brand) })) : ok,
    cancel: afterDeparture,
  };
}
