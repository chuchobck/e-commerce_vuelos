import { Search, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Page } from '@/app/layout/Page';
import { SEARCH_ANCHOR_ID } from '@/app/layout/RootLayout';
import { TripSummary } from '@/features/results';
import { errorMessage, flightsApi, isApiError, type Hold } from '@/shared/api';
import { es } from '@/shared/i18n';
import { formatUSD } from '@/shared/lib/format';
import { useAsync } from '@/shared/lib/useAsync';
import {
  Alert,
  Button,
  Card,
  CardTitle,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  Stepper,
  Timer,
  toast,
} from '@/shared/ui';

const p = es.purchase;
const STEPS = [p.steps.fare, p.steps.passenger, p.steps.payment];

export function PurchasePage() {
  const [query] = useSearchParams();
  const holdId = query.get('reserva');
  const navigate = useNavigate();
  const hold = useAsync(() => (holdId ? flightsApi.getHold(holdId) : Promise.resolve(null)), [holdId]);
  const [expired, setExpired] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [extending, setExtending] = useState(false);

  const searchAgain = (
    <Button asChild>
      <Link to={`/#${SEARCH_ANCHOR_ID}`}>
        <Search aria-hidden="true" />
        {p.searchAgain}
      </Link>
    </Button>
  );

  const cancel = async (h: Hold) => {
    setCancelling(true);
    try {
      await flightsApi.cancelHold(h.id);
      setConfirmOpen(false);
      toast({ title: p.cancelled, variant: 'success' });
      navigate(-1);
    } catch (error) {
      toast({ title: errorMessage(error), variant: 'error' });
    } finally {
      setCancelling(false);
    }
  };

  /** "Necesito más tiempo": se crea un hold nuevo con la misma selección y se libera el anterior. */
  const extend = async (h: Hold) => {
    setExtending(true);
    try {
      const next = await flightsApi.createHold({
        outbound: { offerId: h.outbound.offer.id, fareId: h.outbound.fare.id },
        inbound: h.inbound ? { offerId: h.inbound.offer.id, fareId: h.inbound.fare.id } : undefined,
        passengers: h.passengers,
      });
      await flightsApi.cancelHold(h.id).catch(() => undefined);
      toast({ title: p.extended, variant: 'success' });
      navigate(`/compra?reserva=${encodeURIComponent(next.id)}`, { replace: true });
    } catch (error) {
      toast({ title: errorMessage(error), variant: 'error' });
    } finally {
      setExtending(false);
    }
  };

  let content;
  if (!holdId) {
    content = <EmptyState title={p.emptyTitle} text={p.emptyText} icon={<ShoppingCart className="size-8" />} action={searchAgain} />;
  } else if (hold.status === 'loading' || hold.status === 'idle') {
    content = <LoadingState skeletons={2} />;
  } else if (hold.status === 'error') {
    content =
      isApiError(hold.error) && hold.error.status === 404 ? (
        <EmptyState title={p.notFoundTitle} text={p.notFoundText} action={searchAgain} />
      ) : (
        <ErrorState error={hold.error} onRetry={() => void hold.execute()} />
      );
  } else if (hold.data) {
    const h = hold.data;
    const isExpired = expired || h.status !== 'ACTIVE';
    content = (
      <>
        <Stepper steps={STEPS} current={1} />
        {isExpired ? (
          <Alert variant="error" live="assertive" title={p.holdExpiredTitle} action={searchAgain}>
            <p>{p.holdExpiredText}</p>
          </Alert>
        ) : (
          <Timer
            expiresAt={h.expiresAt}
            onExpire={() => setExpired(true)}
            onExtend={() => void extend(h)}
            extending={extending}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardTitle className="mb-6">{p.summaryTitle}</CardTitle>
            <TripSummary outbound={h.outbound} inbound={h.inbound} />
          </Card>
          <Card className="flex flex-col gap-4">
            <CardTitle>{p.holdTitle}</CardTitle>
            <p className="text-muted">{p.holdText}</p>
            <p className="flex flex-col">
              <span className="text-sm text-muted">{p.totalLabel}</span>
              <span className="text-3xl font-bold tabular-nums">{formatUSD(h.totalPrice)}</span>
            </p>
            {!isExpired ? (
              <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
                {p.cancelHold}
              </Button>
            ) : null}
          </Card>
        </div>

        <Alert variant="info">
          <p>{p.nextStepNotice}</p>
        </Alert>

        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={p.cancelHoldConfirmTitle}
          description={p.cancelHoldConfirmText}
          confirmLabel={p.cancelHoldConfirm}
          cancelLabel={p.cancelHoldKeep}
          loading={cancelling}
          destructive
          onConfirm={() => void cancel(h)}
        />
      </>
    );
  }

  return (
    <Page title={p.pageTitle} heading={p.heading}>
      {content}
    </Page>
  );
}
