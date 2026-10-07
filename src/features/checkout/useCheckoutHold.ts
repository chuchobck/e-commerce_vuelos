import { useState } from 'react';
import { errorMessage, flightsApi, type CreateHoldRequest, type Hold, type PassengerCount, type SelectedLeg } from '@/shared/api';
import { es } from '@/shared/i18n';
import { useAsync } from '@/shared/lib/useAsync';
import { toast } from '@/shared/ui';
import { setSelectionHold, type CheckoutSelection } from './selection';

/** Pedido de hold con la forma del contrato: un itinerario y su familia por tramo. */
function holdRequest(offerId: string, outbound: SelectedLeg, inbound: SelectedLeg | undefined, passengers: PassengerCount): CreateHoldRequest {
  return {
    offerId,
    itinerarySelections: [outbound, ...(inbound ? [inbound] : [])].map((leg) => ({
      itineraryId: leg.itinerary.id,
      cabinClass: leg.fare.cabin,
      fareBrand: leg.fare.brand,
    })),
    passengers,
  };
}

function selectionKey(selection: CheckoutSelection) {
  const { offerId, outbound, inbound, passengers } = selection;
  return [offerId, outbound.fare.brand, inbound?.fare.brand ?? '', passengers.adults, passengers.children, passengers.infants].join('|');
}

/**
 * Creación en curso. En desarrollo StrictMode monta dos veces: sin esto se apartaría
 * cupo dos veces para la misma selección.
 */
let creating: { key: string; promise: Promise<Hold> } | null = null;

function createHoldOnce(selection: CheckoutSelection): Promise<Hold> {
  const key = selectionKey(selection);
  if (creating?.key !== key) {
    const promise = flightsApi
      .createHold(holdRequest(selection.offerId, selection.outbound, selection.inbound, selection.passengers))
      .then((hold) => {
        setSelectionHold(hold.id);
        return hold;
      })
      .finally(() => {
        if (creating?.promise === promise) creating = null;
      });
    creating = { key, promise };
  }
  return creating.promise;
}

/**
 * Hold de la compra (README, sección 5): se crea en el paso 2 solo con sesión (`create`)
 * y se reutiliza al refrescar o al pasar al paso 3 gracias al id guardado en la selección.
 * `state.data` es `null` si todavía no corresponde tener hold.
 */
export function useCheckoutHold(selection: CheckoutSelection | null, { create }: { create: boolean }) {
  const state = useAsync<Hold | null>(
    async () => {
      if (!selection) return null;
      if (selection.holdId) return flightsApi.getHold(selection.holdId);
      return create ? createHoldOnce(selection) : null;
    },
    [selection ? selectionKey(selection) : '', selection?.holdId ?? '', create],
  );
  const [expired, setExpired] = useState(false);
  const [extending, setExtending] = useState(false);

  /** "Necesito más tiempo" (WCAG 2.2.1): hold nuevo con la misma selección; el anterior se libera. */
  const extend = async (previous: Hold) => {
    setExtending(true);
    try {
      const next = await flightsApi.createHold(holdRequest(previous.offerId, previous.outbound, previous.inbound, previous.passengers));
      await flightsApi.cancelHold(previous.id).catch(() => undefined);
      setSelectionHold(next.id);
      state.setState({ status: 'success', data: next, error: undefined });
      setExpired(false);
      toast({ title: es.purchase.extended, variant: 'success' });
    } catch (error) {
      toast({ title: errorMessage(error), variant: 'error' });
    } finally {
      setExtending(false);
    }
  };

  const hold = state.status === 'success' ? state.data : null;
  return {
    state,
    hold,
    /** Hay hold y sigue vigente. */
    active: !!hold && hold.status === 'ACTIVE' && !expired,
    statusProps: {
      state,
      expired,
      extending,
      onExpire: () => setExpired(true),
      onExtend: (h: Hold) => void extend(h),
      onRetry: () => void state.execute(),
    },
  };
}
