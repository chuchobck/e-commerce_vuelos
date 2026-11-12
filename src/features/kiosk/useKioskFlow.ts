import { useCallback, useEffect, useRef, useState } from 'react';
import { flightsApi, type BoardingPass, type KioskSession } from '@/shared/api';
import { es } from '@/shared/i18n';
import { applyCheckIn } from './flightCheckIn';
import { identificationSchema, normalizePnr } from './identification';
import { isKioskSessionExpired, kioskErrorMessage } from './kioskMessages';

export type KioskStep = 'identify' | 'booking' | 'passes';
export type KioskBusy = 'lookup' | 'check-in' | 'passes' | null;

/** El token del kiosko dura 10 minutos; si el reloj del equipo no coincide con el del servidor, manda la respuesta 401 de la API. */
const MAX_SESSION_MS = 10 * 60_000;
const MIN_SESSION_MS = 30_000;

export interface KioskFlowState {
  step: KioskStep;
  pnr: string;
  lastName: string;
  session: KioskSession | null;
  passes: BoardingPass[];
  busy: KioskBusy;
  /** Mensaje de un error de la última acción (se muestra con role="alert"). */
  error: string | null;
  /** Aviso del reinicio anterior (venció la sesión, hubo inactividad, se terminó). */
  notice: string | null;
}

const EMPTY: KioskFlowState = { step: 'identify', pnr: '', lastName: '', session: null, passes: [], busy: null, error: null, notice: null };

/**
 * Flujo del kiosko: identificación → reserva → pases. TODO vive en memoria de este hook: el token, el identificador de la reserva,
 * el código y el apellido nunca se escriben en almacenamiento, URL, consola ni mensajes. `reset` lo borra todo.
 * Las respuestas de una acción anterior a un reinicio se ignoran (`epoch`).
 */
export function useKioskFlow() {
  const [state, setState] = useState<KioskFlowState>(EMPTY);
  const epoch = useRef(0);
  const busy = useRef(false);
  const sessionRef = useRef<KioskSession | null>(null);
  sessionRef.current = state.session;

  const reset = useCallback((notice: string | null = null) => {
    epoch.current += 1;
    busy.current = false;
    setState({ ...EMPTY, notice });
  }, []);

  // El token vence: se borra todo aunque el pasajero no haya tocado nada (la API también lo rechazaría con 401).
  const expiresAt = state.session?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const left = Date.parse(expiresAt) - Date.now();
    const wait = Number.isFinite(left) ? Math.min(MAX_SESSION_MS, Math.max(MIN_SESSION_MS, left)) : MAX_SESSION_MS;
    const timer = setTimeout(() => reset(es.kiosk.expiredNotice), wait);
    return () => clearTimeout(timer);
  }, [expiresAt, reset]);

  const setPnr = useCallback((value: string) => setState((s) => ({ ...s, pnr: normalizePnr(value), error: null })), []);
  const setLastName = useCallback((value: string) => setState((s) => ({ ...s, lastName: value, error: null })), []);

  /** Corre una acción con el token: una a la vez; un 401 de sesión reinicia, otro error se muestra y deja todo como estaba. */
  const run = useCallback(
    async <T>(kind: Exclude<KioskBusy, null>, action: () => Promise<T>, onDone: (value: T) => void) => {
      if (busy.current) return;
      busy.current = true;
      const mine = epoch.current;
      setState((s) => ({ ...s, busy: kind, error: null, notice: null }));
      try {
        const value = await action();
        if (mine !== epoch.current) return;
        busy.current = false;
        onDone(value);
      } catch (error) {
        if (mine !== epoch.current) return;
        busy.current = false;
        if (isKioskSessionExpired(error)) reset(es.kiosk.errors.sessionExpired);
        else setState((s) => ({ ...s, busy: null, error: kioskErrorMessage(error) }));
      }
    },
    [reset],
  );

  const lookup = useCallback(() => {
    const parsed = identificationSchema.safeParse({ pnr: state.pnr, lastName: state.lastName });
    if (!parsed.success) return;
    void run(
      'lookup',
      () => flightsApi.kioskLookup(parsed.data.pnr, parsed.data.lastName),
      // El código y el apellido ya cumplieron su función: se borran de la memoria.
      (session) => setState({ ...EMPTY, step: 'booking', session }),
    );
  }, [state.pnr, state.lastName, run]);

  const loadPasses = useCallback(
    (session: KioskSession, kind: 'check-in' | 'passes', then?: (s: KioskSession) => KioskSession) =>
      flightsApi.kioskBoardingPasses(session.booking.id, session.token).then((passes) => ({ passes, session: then ? then(session) : session, kind })),
    [],
  );

  const viewPasses = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    void run('passes', () => loadPasses(session, 'passes'), ({ passes }) => setState((s) => ({ ...s, step: 'passes', passes, busy: null })));
  }, [run, loadPasses]);

  const checkIn = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    void run(
      'check-in',
      async () => {
        const result = await flightsApi.kioskCheckIn(session.booking.id, session.token);
        return loadPasses(applyCheckIn(session, result), 'check-in');
      },
      ({ passes, session: next }) => setState((s) => ({ ...s, step: 'passes', session: next, passes, busy: null })),
    );
  }, [run, loadPasses]);

  const backToBooking = useCallback(() => setState((s) => ({ ...s, step: 'booking', error: null })), []);

  return { state, setPnr, setLastName, lookup, checkIn, viewPasses, backToBooking, reset };
}
