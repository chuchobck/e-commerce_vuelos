import { Ban, CalendarCheck, CalendarClock, Luggage, QrCode, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { routes } from '@/app/routes';
import type { Booking } from '@/shared/api';
import { es } from '@/shared/i18n';
import { Button, Card, CardTitle } from '@/shared/ui';
import { bookingActions, type TripAction } from './bookingActions';

const t = es.aftersale.actions;

const ITEMS: { id: TripAction; label: string; icon: LucideIcon; to: (id: string) => string; variant: 'primary' | 'secondary' }[] = [
  { id: 'checkIn', label: t.checkIn, icon: CalendarCheck, to: routes.tripCheckIn, variant: 'primary' },
  { id: 'passes', label: t.passes, icon: QrCode, to: routes.tripPasses, variant: 'secondary' },
  { id: 'baggage', label: t.baggage, icon: Luggage, to: routes.tripBaggage, variant: 'secondary' },
  { id: 'dateChange', label: t.dateChange, icon: CalendarClock, to: routes.tripDateChange, variant: 'secondary' },
  { id: 'cancel', label: t.cancel, icon: Ban, to: routes.tripCancel, variant: 'secondary' },
];

/**
 * Trámites de la reserva. Solo se muestran los que corresponden a su estado y solo se activan los que se pueden usar
 * ahora; el que no se puede dice por qué (y cuándo abre, en el check-in) al lado, enlazado con aria-describedby.
 */
export function TripActions({ booking, now }: { booking: Booking; now?: Date }) {
  const actions = bookingActions(booking, now);
  const visible = ITEMS.filter((item) => actions[item.id].visible);

  return (
    <Card className="flex flex-col gap-4 print:hidden">
      <CardTitle>{t.title}</CardTitle>
      {visible.length === 0 ? (
        <p className="text-muted">{t.noActions}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map(({ id, label, icon: Icon, to, variant }) => {
            const state = actions[id];
            const reasonId = `trip-action-${id}-reason`;
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
