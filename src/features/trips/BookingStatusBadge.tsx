import type { BookingStatus } from '@/shared/api';
import { es } from '@/shared/i18n';
import { Badge } from '@/shared/ui';

const TONE = {
  PENDING: 'info',
  PENDING_PAYMENT: 'info',
  TICKET_ISSUING: 'info',
  CONFIRMED: 'success',
  FAILED: 'error',
  CHANGE_PENDING: 'info',
  CANCELLATION_PENDING: 'info',
  CANCELLED: 'error',
} as const satisfies Record<BookingStatus, string>;

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={TONE[status]}>{es.trip.status[status]}</Badge>;
}
