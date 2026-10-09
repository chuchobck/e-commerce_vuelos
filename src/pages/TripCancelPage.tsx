import { ArrowLeft, Ban, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { routes } from '@/app/routes';
import { useAuth } from '@/features/auth';
import { PostSaleNotice, useCancellation } from '@/features/aftersale';
import { TripFallback, useBooking } from '@/features/trips';
import { errorMessage } from '@/shared/api';
import { es, fmt } from '@/shared/i18n';
import { formatMoney, formatTime } from '@/shared/lib/format';
import { Alert, Button, Card, ConfirmDialog, ErrorState, Field, LoadingState, Input, TripSummary } from '@/shared/ui';

const t = es.aftersale.cancel;
const MAX_REASON = 200;

/**
 * Cancelación: 1) cotización (cuánto te devolvemos y la penalidad, en palabras simples), 2) confirmación explícita en un
 * diálogo («Entiendo que esta acción no se puede deshacer») → POST cancel con Idempotency-Key. 200 cancelada, 202 en
 * proceso (CANCELLATION_PENDING, con botón para actualizar) y la reserva pasa a «Cancelados».
 */
export function TripCancelPage() {
  const { id = '' } = useParams();
  const { authorized } = useAuth();
  const trip = useBooking(id, authorized);
  const booking = trip.booking;
  const { state, cancel, renew } = useCancellation(id, authorized, () => void trip.refresh());
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [checked, setChecked] = useState(false);

  const quote = state.quote.status === 'ready' ? state.quote.data : null;

  const start = () => {
    if (reason.length > MAX_REASON) {
      setReasonError(t.reasonMax);
      return;
    }
    setReasonError(undefined);
    setOpen(true);
  };

  const confirm = async () => {
    await cancel(reason);
    setOpen(false);
  };

  const checkPending = async () => {
    setRefreshing(true);
    await trip.refresh();
    setRefreshing(false);
    setChecked(true);
  };

  const backToTrip = (
    <Button asChild variant="secondary">
      <Link to={routes.trip(id)}>
        <ArrowLeft aria-hidden="true" />
        {t.backToTrip}
      </Link>
    </Button>
  );

  let content;
  if (!booking) {
    content = <TripFallback state={trip} onRetry={() => void trip.refresh()} />;
  } else if (state.outcome === 'done' || (state.outcome === 'pending' && booking.status === 'CANCELLED')) {
    content = (
      <>
        <PostSaleNotice tone="success" title={state.outcome === 'pending' ? t.pendingDone : t.successTitle}>
          <p>{quote && quote.refund.cents > 0 ? fmt(t.successRefund, { refund: formatMoney(quote.refund) }) : t.successNoRefund}</p>
        </PostSaleNotice>
        <div className="flex flex-wrap gap-4">
          <Button asChild>
            <Link to={routes.trips()}>{t.seeCancelled}</Link>
          </Button>
          {backToTrip}
        </div>
      </>
    );
  } else if (state.outcome === 'pending') {
    content = (
      <>
        <PostSaleNotice tone="pending" title={t.pendingTitle} onRefresh={() => void checkPending()} refreshing={refreshing} refreshLabel={t.pendingRefresh}>
          <p>{t.pendingText}</p>
          {checked ? <p role="status">{t.pendingStill}</p> : null}
        </PostSaleNotice>
        <div>{backToTrip}</div>
      </>
    );
  } else if (booking.status === 'CANCELLED' || booking.status === 'CANCELLATION_PENDING') {
    content = (
      <>
        <Alert variant="info" live="polite">
          <p>{booking.status === 'CANCELLED' ? t.already : t.pendingText}</p>
        </Alert>
        <div>{backToTrip}</div>
      </>
    );
  } else if (booking.status !== 'CONFIRMED') {
    content = (
      <>
        <Alert variant="info" live="polite">
          <p>{t.notAllowed}</p>
        </Alert>
        <div>{backToTrip}</div>
      </>
    );
  } else {
    content = (
      <>
        <Card className="flex flex-col gap-6">
          <TripSummary outbound={booking.outbound} inbound={booking.inbound} />
        </Card>

        {state.quote.status === 'loading' ? <LoadingState label={t.loadingQuote} /> : null}
        {state.quote.status === 'error' ? <ErrorState error={state.quote.error} onRetry={() => void renew()} /> : null}

        {quote ? (
          <Card className="flex flex-col gap-4">
            <h2 className="text-xl">{t.quoteTitle}</h2>
            <dl className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-4">
                <dt>{t.totalLabel}</dt>
                <dd className="tabular-nums">{formatMoney(booking.total)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt>{t.penaltyLabel}</dt>
                <dd className="tabular-nums">−{formatMoney(quote.penalty)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 rounded border-2 border-border bg-background p-4 text-xl font-bold">
                <dt>{t.refundLabel}</dt>
                <dd className="tabular-nums">{formatMoney(quote.refund)}</dd>
              </div>
            </dl>
            <p>{quote.refundable ? t.refundable : t.notRefundable}</p>
            {state.expired ? (
              <Alert
                variant="warning"
                live="polite"
                action={
                  <Button variant="secondary" onClick={() => void renew()}>
                    <RefreshCw aria-hidden="true" />
                    {t.renewQuote}
                  </Button>
                }
              >
                <p>{t.quoteExpired}</p>
              </Alert>
            ) : (
              <p className="text-sm text-muted">{fmt(t.quoteExpires, { time: formatTime(quote.expiresAt) })}</p>
            )}
          </Card>
        ) : null}

        {state.error ? (
          <PostSaleNotice tone="error" title={es.states.errorTitle}>
            <p>{errorMessage(state.error)}</p>
          </PostSaleNotice>
        ) : null}

        {quote ? (
          <>
            <Field id="cancel-reason" label={t.reasonLabel} hint={t.reasonHint} error={reasonError}>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={MAX_REASON + 20} />
            </Field>
            <div className="flex flex-wrap gap-4">
              <Button variant="danger" size="lg" disabled={state.expired} onClick={start}>
                <Ban aria-hidden="true" />
                {t.start}
              </Button>
              {backToTrip}
            </div>
          </>
        ) : null}

        <ConfirmDialog
          open={open}
          onOpenChange={(next) => !state.cancelling && setOpen(next)}
          title={fmt(t.dialogTitle, { code: booking.code })}
          description={fmt(t.dialogText, { refund: quote && quote.refund.cents > 0 ? fmt(t.dialogRefund, { refund: formatMoney(quote.refund) }) : t.dialogNoRefund })}
          acknowledge={t.understand}
          confirmLabel={t.confirm}
          cancelLabel={t.keepDialog}
          destructive
          loading={state.cancelling}
          onConfirm={() => void confirm()}
        />
      </>
    );
  }

  return (
    <Page title={booking ? `${t.pageTitle} ${booking.code}` : t.pageTitle} heading={booking ? fmt(t.heading, { code: booking.code }) : t.pageTitle} lead={t.lead} width="narrow">
      {content}
    </Page>
  );
}
