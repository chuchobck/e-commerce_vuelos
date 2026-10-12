import { Link } from 'react-router-dom';
import { routes } from '@/app/routes';
import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';

const t = es.aftersale.tabs;

export type TripSection = 'summary' | 'tickets' | 'passes';

/** Secciones del viaje (Resumen, Boletos, Pases de abordar) como enlaces: cada una es su página y tiene su dirección. */
export function TripTabs({ bookingId, current }: { bookingId: string; current: TripSection }) {
  const items: { id: TripSection; label: string; to: string }[] = [
    { id: 'summary', label: t.summary, to: routes.trip(bookingId) },
    { id: 'tickets', label: t.tickets, to: routes.tripTickets(bookingId) },
    { id: 'passes', label: t.passes, to: routes.tripPasses(bookingId) },
  ];
  return (
    <nav aria-label={t.label} className="print:hidden">
      <ul className="flex flex-wrap gap-2 border-b-2 border-border pb-4">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={item.to}
              aria-current={item.id === current ? 'page' : undefined}
              className={cn(
                'flex min-h-12 items-center rounded-full border-2 px-6 font-bold no-underline',
                item.id === current ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-surface text-foreground hover:bg-primary-tint',
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
