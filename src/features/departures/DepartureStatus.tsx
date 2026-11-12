import { AlertTriangle, Ban, Clock, DoorOpen, PlaneLanding, PlaneTakeoff, Shuffle, type LucideIcon } from 'lucide-react';
import type { DepartureStatus as Status } from '@/shared/api';
import { es } from '@/shared/i18n';
import { cn } from '@/shared/lib/cn';

const STYLE: Record<Status, { Icon: LucideIcon; color: string }> = {
  SCHEDULED: { Icon: Clock, color: 'text-foreground' },
  BOARDING: { Icon: DoorOpen, color: 'text-success' },
  DEPARTED: { Icon: PlaneTakeoff, color: 'text-primary' },
  DELAYED: { Icon: AlertTriangle, color: 'text-warning' },
  ARRIVED: { Icon: PlaneLanding, color: 'text-primary' },
  CANCELLED: { Icon: Ban, color: 'text-error' },
  DIVERTED: { Icon: Shuffle, color: 'text-warning' },
};

/** Estado de un vuelo con icono y texto: nunca solo color. Un estado que el frontend no conoce se dice sin inventar nada. */
export function DepartureStatus({ status }: { status: Status | null }) {
  const style = status ? STYLE[status] : null;
  return (
    <span className={cn('inline-flex flex-col items-start gap-1 font-bold sm:flex-row sm:items-center sm:gap-2', style?.color)}>
      {style ? <style.Icon aria-hidden="true" className="size-5 shrink-0 sm:size-6" /> : null}
      {status ? es.departures.states[status] : es.departures.unknownStatus}
    </span>
  );
}
