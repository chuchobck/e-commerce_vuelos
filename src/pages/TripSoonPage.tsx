import { ArrowLeft, CalendarClock, Luggage, QrCode } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { es } from '@/shared/i18n';
import { Button, EmptyState } from '@/shared/ui';

const t = es.trip;

const KINDS = {
  passes: { title: t.passes, text: t.passesText, icon: QrCode },
  baggage: { title: t.baggage, text: t.baggageText, icon: Luggage },
  dateChange: { title: t.dateChange, text: t.dateChangeText, icon: CalendarClock },
} as const;

/** Postventa que se construye en F6 (pases, equipaje, cambio de fecha): pantalla de espera con salida clara. */
export function TripSoonPage({ kind }: { kind: keyof typeof KINDS }) {
  const { id = '' } = useParams();
  const { title, text, icon: Icon } = KINDS[kind];
  return (
    <Page title={title} width="narrow">
      <EmptyState
        title={t.soonTitle}
        text={text}
        icon={<Icon className="size-8" />}
        action={
          <Button asChild>
            <Link to={routes.trip(id)}>
              <ArrowLeft aria-hidden="true" />
              {t.backToTrip}
            </Link>
          </Button>
        }
      />
    </Page>
  );
}
