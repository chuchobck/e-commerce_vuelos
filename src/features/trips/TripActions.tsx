import { Ban, CalendarCheck, CalendarClock, Luggage, QrCode, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { routes } from '@/app/routes';
import type { BoardingPass, Booking } from '@/shared/api';
import { es } from '@/shared/i18n';
import { Button, Card, CardTitle } from '@/shared/ui';
import { bookingActions, type TripAction } from './bookingActions';

const t = es.aftersale.actions;

const ITEMS: { id: TripAction; label: string; icon: LucideIcon; to: (id: string) => string }[] = [
  { id: 'checkIn', label: t.checkIn, icon: CalendarCheck, to: routes.tripCheckIn },
  { id: 'passes', label: t.passes, icon: QrCode, to: routes.tripPasses },
  { id: 'baggage', label: t.baggage, icon: Luggage, to: routes.tripBaggage },
  { id: 'dateChange', label: t.dateChange, icon: CalendarClock, to: routes.tripDateChange },
  { id: 'cancel', label: t.cancel, icon: Ban, to: routes.tripCancel },
];

interface TripActionsProps {
  booking: Booking;
  now?: Date;
  /** Pases de abordar de la reserva: dicen qué vuelos ya tienen check-in. `undefined` si no se pudo saber. */
  passes?: readonly BoardingPass[];
}

/**
 * Trámites de la reserva. Solo se muestran los que corresponden a su estado y solo se activan los que se pueden usar
 * ahora; el que no se puede dice por qué (y cuándo abre, en el check-in) al lado, enlazado con aria-describedby. El botón
 * principal va primero: «Ver pases de abordar» si ya hay pases; si no, «Hacer check-in». Si el check-in no se ofrece
 * (ya está hecho, cerró o aún no abre), en su lugar queda el motivo, sin botón.
 */
export function TripActions({ booking, now, passes }: TripActionsProps) {
  const actions = bookingActions(booking, now, passes);
  const primaryId: TripAction = actions.passes.primary ? 'passes' : 'checkIn';
  const shown = ITEMS.filter((item) => actions[item.id].visible || actions[item.id].reason);
  const visible = [...shown.filter((item) => item.id === primaryId), ...shown.filter((item) => item.id !== primaryId)];

  return (
    <Card className="flex flex-col gap-4 print:hidden">
      <CardTitle>{t.title}</CardTitle>
      {visible.length === 0 ? (
        <p className="text-muted">{t.noActions}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map(({ id, label, icon: Icon, to }) => {
            const state = actions[id];
            const reasonId = `trip-action-${id}-reason`;
            const variant = id === primaryId ? 'primary' : 'secondary';
            if (!state.visible) {
              return (
                <li key={id}>
                  <p className="text-sm text-muted">{state.reason}</p>
                </li>
              );
            }
            return (
              <li key={id} className="flex flex-col gap-2">
                {state.enabled ? (
                  <Button asChild variant={variant} fullWidth>
                    <Link to={to(booking.id)}>
                      <Icon aria-hidden="true" />
                      {label}
                    </Link>
                  </Button>
                ) : (
                  <Button variant={variant} fullWidth disabled aria-describedby={state.reason ? reasonId : undefined}>
                    <Icon aria-hidden="true" />
                    {label}
                  </Button>
                )}
                {!state.enabled && state.reason ? (
                  <p id={reasonId} className="text-sm text-muted">
                    {state.reason}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
