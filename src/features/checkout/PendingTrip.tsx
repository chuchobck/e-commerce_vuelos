import { Lock } from 'lucide-react';
import { es } from '@/shared/i18n';
import { Card, CardTitle, TripSummary } from '@/shared/ui';
import { loadSelection } from './selection';

/**
 * "Tu vuelo está guardado": se muestra en Ingresar y Crear cuenta cuando se llegó desde la compra,
 * para que el viajero vea que no perdió nada y qué es lo que va a continuar. Sin selección no pinta nada.
 */
export function PendingTrip() {
  const selection = loadSelection();
  if (!selection) return null;
  return (
    <Card role="region" aria-labelledby="pending-trip-title" className="flex flex-col gap-4 border-primary bg-primary-tint">
      <CardTitle id="pending-trip-title" className="flex items-center gap-2">
        <Lock aria-hidden="true" className="size-6 text-primary" />
        {es.purchase.pendingTitle}
      </CardTitle>
      <p>{es.purchase.pendingText}</p>
      <TripSummary outbound={selection.outbound} inbound={selection.inbound} />
    </Card>
  );
}
