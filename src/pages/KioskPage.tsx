import { BoardingPassCard } from '@/features/checkin';
import { KioskFlow } from '@/features/kiosk';
import { es } from '@/shared/i18n';
import { usePageMeta } from '@/shared/lib/usePageMeta';

/**
 * Kiosko de check-in (/kiosko), público. El pase se dibuja con el mismo componente del e-commerce (`BoardingPassCard`, con su QR);
 * el módulo del kiosko no lo importa (un módulo no importa de otro), la página se lo entrega.
 */
export function KioskPage() {
  usePageMeta(es.kiosk.pageTitle, es.kiosk.metaDescription);
  return (
    <KioskFlow
      renderPass={({ pass, passengerName, flight }) => (
        <BoardingPassCard
          pass={pass}
          passengerName={passengerName}
          segment={flight ? { flightNumber: flight.flightNumber, origin: flight.origin, destination: flight.destination, departureTime: flight.departureAt } : undefined}
        />
      )}
    />
  );
}
