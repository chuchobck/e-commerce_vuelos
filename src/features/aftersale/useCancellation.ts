import { useCallback, useEffect, useRef, useState } from 'react';
import { flightsApi, type CancellationQuote } from '@/shared/api';
import { attemptKeys } from '@/shared/lib/attemptKeys';
import type { Authorized } from '@/shared/lib/authorized';
import { classifyPaymentError } from './outcome';

export interface CancellationState {
  quote: { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; data: CancellationQuote };
  /** La cotización ya venció (se recalcula cada medio minuto): hay que pedir una nueva. */
  expired: boolean;
  cancelling: boolean;
  /** Error al cancelar (la cotización vencida o la reserva ya cancelada incluidas). */
  error: unknown;
  outcome: 'done' | 'pending' | null;
}

const TICK_MS = 15_000;

/**
 * Cancelación en dos pasos: cotización (GET cancellation-quote, se pide al abrir) y confirmación (POST cancel con la
 * cotización e Idempotency-Key). La clave es una por intento (misma cotización y motivo = misma clave: un reintento o
 * un doble clic no cancelan dos veces). Si la cotización vence, se pide otra; la cancelación nunca se reintenta sola.
 */
export function useCancellation(bookingId: string, authorized: Authorized, onChanged?: () => void) {
  const [quote, setQuote] = useState<CancellationState['quote']>({ status: 'loading' });
  const [now, setNow] = useState(() => Date.now());
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const [outcome, setOutcome] = useState<CancellationState['outcome']>(null);
  const call = useRef(0);
  const busy = useRef(false);
  // `authorized` cambia en cada render del proveedor de sesión: se lee por referencia para no repetir la carga.
  const authorizedRef = useRef(authorized);
  authorizedRef.current = authorized;

  const loadQuote = useCallback(async () => {
    const id = ++call.current;
    setQuote({ status: 'loading' });
    setError(undefined);
    try {
      const data = await authorizedRef.current(() => flightsApi.getCancellationQuote(bookingId));
      if (id === call.current) {
        setQuote({ status: 'ready', data });
        setNow(Date.now());
      }
    } catch (e) {
      if (id === call.current) setQuote({ status: 'error', error: e });
    }
  }, [bookingId]);

  useEffect(() => {
    void loadQuote();
    const calls = call;
    return () => {
      calls.current++;
    };
  }, [loadQuote]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const cancel = useCallback(
    async (reason?: string) => {
      if (quote.status !== 'ready' || busy.current) return;
      busy.current = true;
      setCancelling(true);
      setError(undefined);
      const request = { quoteId: quote.data.quoteId, ...(reason?.trim() ? { reason: reason.trim() } : {}) };
      const scope = `cancel:${bookingId}`;
      try {
        const result = await authorizedRef.current(() => flightsApi.cancelBooking(bookingId, request, attemptKeys.keyFor(scope, request)));
        if (result.status === 'done') attemptKeys.forget(scope);
        setOutcome(result.status);
        onChanged?.();
      } catch (e) {
        setError(e);
        // Una cotización vencida no sirve para reintentar: se pide otra.
        if (classifyPaymentError(e) === 'expired') void loadQuote();
      } finally {
        busy.current = false;
        setCancelling(false);
      }
    },
    [quote, bookingId, onChanged, loadQuote],
  );

  const expired = quote.status === 'ready' && new Date(quote.data.expiresAt).getTime() <= now;
  return { state: { quote, expired, cancelling, error, outcome } satisfies CancellationState, cancel, renew: loadQuote };
}
