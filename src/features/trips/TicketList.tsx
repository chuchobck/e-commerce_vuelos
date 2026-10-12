import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { flightsApi, type BookedTicket, type Booking, type TicketStatus } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import type { Authorized } from '@/shared/lib/authorized';
import { formatLongDate } from '@/shared/lib/format';
import { Badge, Button, ErrorState, LoadingState } from '@/shared/ui';


const t = es.aftersale.tickets;

const TONE: Record<TicketStatus, 'success' | 'info' | 'error' | 'warning' | 'neutral'> = {
  PENDING: 'info',
  ISSUING: 'info',
  ISSUED: 'success',
  FAILED: 'error',
  VOIDED: 'neutral',
  REFUNDED: 'warning',
};

type Detail = { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; ticket: BookedTicket };

interface TicketListProps {
  booking: Booking;
  tickets: BookedTicket[];
  authorized: Authorized;
}

/** Boletos de la reserva, uno por pasajero. «Ver detalle» pide el boleto (GET …/tickets/{id}) y muestra sus cupones. */
export function TicketList({ booking, tickets, authorized }: TicketListProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});

  const nameOf = (passengerId: string) => {
    const p = booking.passengers.find((x) => x.id === passengerId);
    return p ? `${p.firstName} ${p.lastName}` : passengerId;
  };
  const segmentLabel = (segmentId: string) => {
    const segment = [booking.outbound, booking.inbound].flatMap((leg) => leg?.itinerary.segments ?? []).find((s) => s.id === segmentId);
    return segment ? `${segment.origin} → ${segment.destination} · ${segment.flightNumber}` : segmentId;
  };

  const load = async (ticketId: string) => {
    setDetails((d) => ({ ...d, [ticketId]: { status: 'loading' } }));
    try {
      const ticket = await authorized(() => flightsApi.getTicket(booking.id, ticketId));
      setDetails((d) => ({ ...d, [ticketId]: { status: 'ready', ticket } }));
    } catch (error) {
      setDetails((d) => ({ ...d, [ticketId]: { status: 'error', error } }));
    }
  };

  const toggle = (ticketId: string) => {
    if (open === ticketId) return setOpen(null);
    setOpen(ticketId);
    if (!details[ticketId] || details[ticketId].status === 'error') void load(ticketId);
  };

  return (
    <ul aria-label={t.listLabel} className="flex flex-col gap-4">
      {tickets.map((ticket) => {
        const expanded = open === ticket.id;
        const detail = details[ticket.id];
        const panelId = `ticket-${ticket.id.replace(/[^A-Za-z0-9_-]/g, '')}`;
        return (
          <li key={ticket.id}>
            <article aria-labelledby={`${panelId}-title`} className="flex flex-col gap-4 rounded border-2 border-border bg-surface p-6 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <h2 id={`${panelId}-title`} className="text-xl">
                    {nameOf(ticket.passengerId)}
                  </h2>
                  <p className="text-muted">
                    {t.number}: <span className="font-bold tabular-nums text-foreground">{ticket.number ?? t.numberPending}</span>
                  </p>
                  {ticket.issuedAt ? <p className="text-sm text-muted">{fmt(t.issuedAt, { date: formatLongDate(ticket.issuedAt) })}</p> : null}
                </div>
                <Badge tone={TONE[ticket.status]}>{t.status[ticket.status]}</Badge>
              </div>
              {ticket.status === 'FAILED' ? <p role="status">{t.failed}</p> : null}
              <div>
                <Button variant="secondary" aria-expanded={expanded} aria-controls={panelId} onClick={() => toggle(ticket.id)}>
                  {expanded ? t.hide : t.view}
                  <ChevronDown aria-hidden="true" className={expanded ? 'rotate-180' : undefined} />
                </Button>
              </div>
              <div id={panelId} role="region" aria-label={`${t.segmentsTitle}: ${nameOf(ticket.passengerId)}`} hidden={!expanded}>
                {expanded && (!detail || detail.status === 'loading') ? <LoadingState label={t.detailLoading} /> : null}
                {expanded && detail?.status === 'error' ? <ErrorState error={detail.error} onRetry={() => void load(ticket.id)} headingLevel="h3" /> : null}
                {expanded && detail?.status === 'ready' ? (
                  <ul className="flex flex-col divide-y-2 divide-border">
                    {detail.ticket.segments.length === 0 ? <li className="py-2 text-muted">{t.couponNone}</li> : null}
                    {detail.ticket.segments.map((s) => (
                      <li key={s.segmentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="font-bold">{segmentLabel(s.segmentId)}</span>
                        <span className="text-sm text-muted">
                          {t.segmentStatus[s.status]} · {s.coupon ? fmt(t.coupon, { coupon: s.coupon }) : t.couponNone}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
