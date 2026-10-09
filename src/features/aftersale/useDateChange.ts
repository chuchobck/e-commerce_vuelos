import { useCallback, useRef, useState } from 'react';
import { flightsApi, type DateChangeOption } from '@/shared/api';
import { attemptKeys } from '@/shared/lib/attemptKeys';
import type { Authorized } from '@/shared/lib/authorized';
import { needsPayment } from './dateChange';
import { classifyPaymentError, type PaymentProblem } from './outcome';

export type DateChangeStep = 'search' | 'options' | 'confirm' | 'result';

export interface DateChangeState {
  step: DateChangeStep;
  /** Itinerario que se cambia y nueva fecha (yyyy-MM-dd) de la última búsqueda. */
  itineraryId: string | null;
  date: string | null;
  searching: boolean;
  searchError: unknown;
  options: DateChangeOption[] | null;
  chosen: DateChangeOption | null;
  confirming: boolean;
  confirmError: unknown;
  /** Qué pasó con el cobro si la confirmación falló: sirve para el mensaje y para no perder lo elegido. */
  problem: PaymentProblem | null;
  /** `done`: cambio hecho (200). `pending`: aceptado y en proceso (202, CHANGE_PENDING). */
  outcome: 'done' | 'pending' | null;
}

const INITIAL: DateChangeState = {
  step: 'search',
  itineraryId: null,
  date: null,
  searching: false,
  searchError: undefined,
  options: null,
  chosen: null,
  confirming: false,
  confirmError: undefined,
  problem: null,
  outcome: null,
};

/**
 * Cambio de fecha en pasos: buscar (POST date-change/search, solo lectura) → elegir una alternativa → confirmar
 * (POST date-change con Idempotency-Key). La clave es una por intento: mismo cambio y mismo pago = misma clave (reintento,
 * 202 o doble clic); otro pago tras un rechazo = clave nueva. Un rechazo de pago (422) deja la elección intacta para reintentar.
 * Una oferta vencida (410) vuelve a la búsqueda.
 */
export function useDateChange(bookingId: string, authorized: Authorized, onChanged?: () => void) {
  const [state, setState] = useState<DateChangeState>(INITIAL);
  const busy = useRef(false);

  const search = useCallback(
    async (itineraryId: string, date: string) => {
      setState((s) => ({ ...s, searching: true, searchError: undefined, itineraryId, date }));
      try {
        const options = await authorized(() => flightsApi.searchDateChange(bookingId, [{ itineraryId, newDepartureDate: date }]));
        setState((s) => ({ ...s, searching: false, options, step: 'options', chosen: null, confirmError: undefined, problem: null }));
      } catch (error) {
        setState((s) => ({ ...s, searching: false, searchError: error }));
      }
    },
    [bookingId, authorized],
  );

  const choose = useCallback((chosen: DateChangeOption) => {
    setState((s) => ({ ...s, chosen, step: 'confirm', confirmError: undefined, problem: null }));
  }, []);

  const backToOptions = useCallback(() => {
    setState((s) => ({ ...s, step: 'options', chosen: null, confirmError: undefined, problem: null }));
  }, []);

  const backToSearch = useCallback(() => setState((s) => ({ ...INITIAL, itineraryId: s.itineraryId, date: s.date })), []);

  const confirm = useCallback(
    async (paymentReference: string) => {
      const chosen = state.chosen;
      if (!chosen || busy.current) return;
      busy.current = true;
      setState((s) => ({ ...s, confirming: true, confirmError: undefined, problem: null }));
      const request = { changeOfferId: chosen.id, ...(needsPayment(chosen.price) ? { paymentReference } : {}) };
      const scope = `date-change:${bookingId}`;
      try {
        const outcome = await authorized(() => flightsApi.confirmDateChange(bookingId, request, attemptKeys.keyFor(scope, request)));
        if (outcome.status === 'done') attemptKeys.forget(scope);
        setState((s) => ({ ...s, confirming: false, step: 'result', outcome: outcome.status }));
        onChanged?.();
      } catch (error) {
        const problem = classifyPaymentError(error);
        setState((s) =>
          problem === 'expired'
            ? { ...INITIAL, itineraryId: s.itineraryId, date: s.date, searchError: error }
            : { ...s, confirming: false, confirmError: error, problem },
        );
      } finally {
        busy.current = false;
      }
    },
    [state.chosen, bookingId, authorized, onChanged],
  );

  const reset = useCallback(() => setState(INITIAL), []);

  return { state, search, choose, backToOptions, backToSearch, confirm, reset };
}
