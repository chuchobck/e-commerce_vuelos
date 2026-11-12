import { LogOut } from 'lucide-react';
import type { KioskSession } from '@/shared/api';
import { es } from '@/shared/i18n';
import { Alert, Button } from '@/shared/ui';
import { FlightCard } from './FlightCard';
import type { KioskBusy } from './useKioskFlow';

const t = es.kiosk.booking;

interface BookingStepProps {
  session: KioskSession;
  busy: KioskBusy;
  error: string | null;
  onCheckIn: () => void;
  onViewPasses: () => void;
  onFinish: () => void;
}

/** Paso 2: los vuelos de la reserva con sus pasajeros y la acción que corresponde a cada uno. */
export function BookingStep({ session, busy, error, onCheckIn, onViewPasses, onFinish }: BookingStepProps) {
  const { booking } = session;
  const cancelled = booking.status === 'CANCELLED';
  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <Alert variant="error" live="assertive">
          <p>{error}</p>
        </Alert>
      ) : null}
      {cancelled ? (
        <Alert variant="warning">
          <p>{t.cancelled}</p>
        </Alert>
      ) : booking.flights.length === 0 ? (
        <Alert variant="info">
          <p>{t.noFlights}</p>
        </Alert>
      ) : (
        <ul aria-label={t.flightsLabel} className="flex flex-col gap-6">
          {booking.flights.map((flight) => (
            <li key={flight.segmentId}>
              <FlightCard flight={flight} passengers={booking.passengers} busy={busy} onCheckIn={onCheckIn} onViewPasses={onViewPasses} />
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" size="lg" className="min-h-14 sm:w-fit" onClick={onFinish}>
        <LogOut aria-hidden="true" />
        {t.finish}
      </Button>
    </div>
  );
}
