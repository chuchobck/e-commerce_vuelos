import type { FlightStatus } from '@/shared/api';
import { Badge } from '@/shared/ui';
import { flightBadge } from './flightDelay';

/** Insignia del estado de un vuelo (icono + texto): a tiempo, retrasado N min, cancelado… */
export function FlightStatusBadge({ status }: { status: Pick<FlightStatus, 'status' | 'departure'> }) {
  const { label, tone } = flightBadge(status);
  return <Badge tone={tone}>{label}</Badge>;
}
