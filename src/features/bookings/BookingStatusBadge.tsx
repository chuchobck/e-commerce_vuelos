import type { BookingStatus } from '@/shared/api';
import { es } from '@/shared/i18n';
import { Badge } from '@/shared/ui';

const TONE = { CONFIRMED: 'success', CHECKED_IN: 'info', CANCELLED: 'error' } as const;

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={TONE[status]}>{es.booking.status[status]}</Badge>;
}
