import { Baby, User } from 'lucide-react';
import type { Booking } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';

const t = es.aftersale.checkin;

/** Quiénes hacen el check-in: todos los pasajeros de la reserva, con su asiento (los infantes viajan en brazos). */
export function CheckInPassengers({ booking }: { booking: Booking }) {
  const firstSegmentId = booking.outbound.itinerary.segments[0]?.id;
  return (
    <section aria-labelledby="checkin-passengers" className="flex flex-col gap-4">
      <h2 id="checkin-passengers" className="text-xl">
        {t.passengersTitle}
      </h2>
      <p className="text-muted">{t.passengersText}</p>
      <ul className="flex flex-col divide-y-2 divide-border rounded border-2 border-border">
        {booking.passengers.map((p) => {
          const seat = p.seats.find((s) => s.segmentId === firstSegmentId)?.seatNumber;
          const Icon = p.type === 'INFANT' ? Baby : User;
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-4">
              <span className="flex items-center gap-2 font-bold">
                <Icon aria-hidden="true" className="size-6 text-primary" />
                {p.firstName} {p.lastName}
              </span>
              <span className="text-sm text-muted">{p.type === 'INFANT' ? t.infantLap : seat ? fmt(t.seatLine, { seat }) : t.seatAuto}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
