/**
 * Ejecuta la compra: llama a la API, guarda lo necesario y alimenta la máquina (machine.ts).
 * Lógica sin React; useCheckout.ts es el adaptador. Una instancia por pestaña (instance.ts).
 *
 * Reglas (README, secciones 5 y 6):
 * - El hold se crea al entrar al paso 2 CON sesión, una sola vez por selección. Refrescar o volver
 *   reutiliza el guardado y lo verifica con GET; si ya venció, se informa.
 * - El tiempo restante sale del servidor; se resincroniza cada minuto y al volver a la pestaña.
 * - Las escrituras llevan Idempotency-Key por intención (idempotency.ts). Reintentar un pago reenvía
 *   EXACTAMENTE el mismo pedido con la misma clave: nunca crea una segunda reserva.
 * - Liberar el hold es de mejor esfuerzo: un 404/409 no es un error para el usuario.
 */
import { isApiError, type Booking, type BookingPassenger, type CreateBookingRequest, type FlightsApi, type Hold } from '@/shared/api';
import type { AttemptStore, PassengerDraftStore } from './draft';
import { HOLD_RESYNC_MS, holdIsLive } from './holdClock';
import type { IntentKeys } from './idempotency';
import { holdOf, initialState, reduce, type CheckoutEvent, type CheckoutState } from './machine';
import type { CheckoutSelection } from './selection';

export type CheckoutApi = Pick<FlightsApi, 'createHold' | 'getHold' | 'cancelHold' | 'createBooking' | 'getBooking'>;

/** Envuelve una llamada con sesión (renovación y reintento ante 401): lo pone la página con useAuth. */
export type Authorized = <T>(call: () => Promise<T>) => Promise<T>;

export interface SelectionStore {
  load(): CheckoutSelection | null;
  setHold(holdId: string | undefined): void;
  clear(): void;
}

export interface CheckoutDeps {
  api: CheckoutApi;
  selection: SelectionStore;
  keys: IntentKeys;
  draft: PassengerDraftStore;
  attempt: AttemptStore;
  now?: () => number;
  /** Repite `fn` cada `ms`; devuelve cómo detenerlo (inyectable en pruebas). */
  every?: (fn: () => void, ms: number) => () => void;
  /** Avisa cuando la pestaña vuelve a estar visible; devuelve cómo dejar de escuchar. */
  onVisible?: (fn: () => void) => () => void;
}

/** El pedido del hold con la forma del contrato: un itinerario y su familia por tramo. */
export function holdRequestOf(selection: CheckoutSelection) {
  return {
    offerId: selection.offerId,
    itinerarySelections: [selection.outbound, ...(selection.inbound ? [selection.inbound] : [])].map((leg) => ({
      itineraryId: leg.itinerary.id,
      cabinClass: leg.fare.cabin,
      fareBrand: leg.fare.brand,
    })),
    passengers: selection.passengers,
  };
}

const identity: Authorized = (call) => call();

const browserEvery = (fn: () => void, ms: number) => {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
};

const browserOnVisible = (fn: () => void) => {
  if (typeof document === 'undefined') return () => undefined;
  const listener = () => {
    if (document.visibilityState === 'visible') fn();
  };
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
};

export class CheckoutFlow {
  private state: CheckoutState = initialState;
  private readonly listeners = new Set<(state: CheckoutState) => void>();
  private authorized: Authorized = identity;
  private readonly now: () => number;
  private holding: Promise<void> | null = null;
  private paying: Promise<void> | null = null;
  /** Pedido y clave del último intento de pago: un reintento los reenvía tal cual. */
  private pending: { request: CreateBookingRequest; key: string } | null = null;
  private stopWatching: (() => void) | null = null;
  /** La selección con la que se trabaja: si el usuario elige otro vuelo, la compra empieza de cero. */
  private selectionId: string | undefined;

  constructor(private readonly deps: CheckoutDeps) {
    this.now = deps.now ?? Date.now;
  }

  /* ------------------------------------------ estado ------------------------------------------ */

  getState = (): CheckoutState => this.state;

  subscribe = (listener: (state: CheckoutState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private dispatch(event: CheckoutEvent): void {
    const next = reduce(this.state, event);
    if (next === this.state) return;
    this.state = next;
    this.watchHold();
    for (const listener of this.listeners) listener(next);
  }

  /** Resincroniza con el servidor cada minuto y al volver a la pestaña, mientras el hold esté en uso. */
  private watchHold(): void {
    const active = this.state.step === 'held' || this.state.step === 'rejected' || (this.state.step === 'error' && this.state.during === 'payment');
    if (active && !this.stopWatching) {
      const stopInterval = (this.deps.every ?? browserEvery)(() => void this.resync(), HOLD_RESYNC_MS);
      const stopVisible = (this.deps.onVisible ?? browserOnVisible)(() => void this.resync());
      this.stopWatching = () => {
        stopInterval();
        stopVisible();
      };
    } else if (!active && this.stopWatching) {
      this.stopWatching();
      this.stopWatching = null;
    }
  }

  /* ----------------------------------------- acciones ----------------------------------------- */

  /**
   * Al entrar al paso 2 o 3. Sin selección no hay compra; sin sesión se espera a que ingrese;
   * con sesión se aparta el precio (o se verifica el hold guardado). Llamarla otra vez no repite nada.
   */
  start({ authenticated, authorized = identity }: { authenticated: boolean; authorized?: Authorized }): Promise<void> {
    this.authorized = authorized;
    const selection = this.deps.selection.load();
    if (!selection) {
      this.dispatch({ type: 'NO_SELECTION' });
      return Promise.resolve();
    }
    if (selection.id !== this.selectionId) {
      this.selectionId = selection.id;
      this.pending = null;
      this.state = initialState;
    }
    if (!authenticated) {
      this.dispatch({ type: 'SIGNED_OUT' });
      return Promise.resolve();
    }
    if (this.holding) return this.holding;
    if (holdOf(this.state) || ['paying', 'confirmed', 'processing', 'failed', 'expired', 'unavailable'].includes(this.state.step)) {
      return Promise.resolve();
    }
    return this.ensureHold(selection);
  }

  /** Crea el hold o verifica el guardado. Una sola vez a la vez (StrictMode monta dos veces). */
  private ensureHold(selection: CheckoutSelection): Promise<void> {
    this.holding ??= (async () => {
      this.dispatch({ type: 'HOLD_START' });
      try {
        let hold: Hold;
        if (selection.holdId) {
          const id = selection.holdId;
          hold = await this.authorized(() => this.deps.api.getHold(id));
        } else {
          const request = holdRequestOf(selection);
          const key = this.deps.keys.keyFor('hold', request);
          hold = await this.authorized(() => this.deps.api.createHold(request, key));
          this.deps.selection.setHold(hold.id);
        }
        if (hold.status === 'CONSUMED' && (await this.recoverBooking(hold))) return;
        this.dispatch({ type: 'HOLD_READY', hold, now: this.now() });
        if (this.state.step === 'expired') this.endHold();
      } catch (error) {
        this.dispatch({ type: 'HOLD_FAILED', error });
        if (isApiError(error) && (error.status === 404 || error.status === 409 || error.status === 422)) this.endHold();
      } finally {
        this.holding = null;
      }
    })();
    return this.holding;
  }

  /**
   * Hold CONSUMED al volver: si el último intento de pago fue con este hold, se reenvía igual
   * (misma clave) y la API devuelve la reserva que sí se creó.
   */
  private async recoverBooking(hold: Hold): Promise<boolean> {
    const attempt = this.deps.attempt.load();
    if (!attempt || attempt.holdId !== hold.id) return false;
    const request: CreateBookingRequest = { holdId: hold.id, passengers: this.deps.draft.load(), paymentReference: attempt.paymentReference };
    const key = this.deps.keys.keyFor('booking', request);
    try {
      const booking = await this.authorized(() => this.deps.api.createBooking(request, key));
      this.booked(booking);
      return true;
    } catch {
      return false;
    }
  }

  /** Pregunta al servidor cuánto le queda al hold. Un error de red no cambia nada. */
  async resync(): Promise<void> {
    const hold = holdOf(this.state);
    if (!hold || this.state.step === 'paying') return;
    try {
      const fresh = await this.authorized(() => this.deps.api.getHold(hold.id));
      this.dispatch({ type: 'HOLD_SYNC', hold: fresh, now: this.now() });
      if (this.state.step === 'expired') this.endHold();
    } catch (error) {
      if (isApiError(error) && error.status === 404) {
        this.dispatch({ type: 'HOLD_FAILED', error });
        this.endHold();
      }
    }
  }

  /** El temporizador llegó a cero: manda el servidor (el reloj local pudo adelantarse). */
  async timeUp(): Promise<void> {
    await this.resync();
    const hold = holdOf(this.state);
    if (hold && holdIsLive(hold, this.now())) return;
    this.dispatch({ type: 'TIME_UP' });
    if (this.state.step === 'expired') this.endHold();
  }

  /** Borrador de pasajeros; `complete` habilita el pago. */
  setPassengers(passengers: BookingPassenger[], complete: boolean): void {
    this.deps.draft.save(passengers);
    this.dispatch({ type: 'PASSENGERS', ready: complete });
  }

  passengersDraft(): BookingPassenger[] {
    return this.deps.draft.load();
  }

  /**
   * Paga con una referencia de la Payment API (shared/payments). Un doble envío devuelve la misma
   * promesa; el pedido y su clave quedan guardados para reintentar sin crear otra reserva.
   */
  pay(paymentReference: string): Promise<void> {
    if (this.paying) return this.paying;
    const hold = holdOf(this.state);
    if (!hold) return Promise.resolve();
    const request: CreateBookingRequest = { holdId: hold.id, passengers: this.deps.draft.load(), paymentReference };
    this.pending = { request, key: this.deps.keys.keyFor('booking', request) };
    this.deps.attempt.save({ holdId: hold.id, paymentReference });
    return this.submit();
  }

  /** Reintento tras un error reintentable: el MISMO pedido con la MISMA clave. */
  retryPayment(): Promise<void> {
    if (this.paying) return this.paying;
    return this.pending ? this.submit() : Promise.resolve();
  }

  private submit(): Promise<void> {
    const pending = this.pending;
    if (!pending) return Promise.resolve();
    this.dispatch({ type: 'PAY_START' });
    if (this.state.step !== 'paying') return Promise.resolve();
    this.paying = (async () => {
      try {
        const booking = await this.authorized(() => this.deps.api.createBooking(pending.request, pending.key));
        this.booked(booking);
      } catch (error) {
        this.dispatch({ type: 'PAY_FAILED', error });
        if (this.state.step === 'rejected') {
          // Un pago nuevo lleva otra referencia (y otra clave); se confirma que el hold sigue vivo.
          this.pending = null;
          this.deps.attempt.clear();
          await this.resync();
        } else if (this.state.step === 'expired') {
          this.endHold();
        }
      } finally {
        this.paying = null;
      }
    })();
    return this.paying;
  }

  /** La reserva existe: la compra terminó (el hold ya es de la reserva). */
  private booked(booking: Booking): void {
    this.dispatch({ type: 'BOOKED', booking });
    this.pending = null;
    this.deps.attempt.clear();
    this.deps.keys.clear();
    this.deps.draft.clear();
    this.deps.selection.clear();
  }

  /** El hold ya no sirve: el mismo vuelo necesitará un hold nuevo (y una clave nueva). */
  private endHold(): void {
    this.deps.keys.forget('hold');
    this.deps.keys.forget('booking');
    this.deps.attempt.clear();
    this.pending = null;
    this.deps.selection.setHold(undefined);
  }

  /** Libera el hold sin molestar al usuario: 404 (ya no existe) o 409 (ya es una reserva) no son errores. */
  private async release(holdId: string | undefined): Promise<void> {
    if (!holdId) return;
    try {
      await this.authorized(() => this.deps.api.cancelHold(holdId));
    } catch {
      /* mejor esfuerzo: si no se pudo, vence solo en ≤ 15 minutos */
    }
  }

  /** "Necesito más tiempo" (WCAG 2.2.1): un hold nuevo con la misma selección y se libera el anterior. */
  async extend(): Promise<void> {
    const previous = holdOf(this.state);
    const selection = this.deps.selection.load();
    if (!previous || !selection) return;
    this.endHold();
    await this.ensureHold({ ...selection, holdId: undefined });
    if (holdOf(this.state)?.id !== previous.id) await this.release(previous.id);
  }

  /** "Cancelar compra": libera el hold y borra la compra. Devuelve la búsqueda para volver a ella. */
  async cancel(): Promise<string | null> {
    const selection = this.deps.selection.load();
    await this.release(holdOf(this.state)?.id ?? selection?.holdId);
    this.deps.keys.clear();
    this.deps.attempt.clear();
    this.deps.draft.clear();
    this.deps.selection.clear();
    this.pending = null;
    this.dispatch({ type: 'NO_SELECTION' });
    return selection?.searchQuery ?? null;
  }

  /**
   * Salir del flujo sin terminar (ir a otra sección): se libera el hold, pero se conservan la
   * selección y lo escrito; al volver se aparta otra vez.
   */
  async leave(): Promise<void> {
    if (this.paying || this.state.step === 'paying') return;
    const hold = holdOf(this.state);
    if (!hold) return;
    this.endHold();
    this.dispatch({ type: 'NO_SELECTION' });
    await this.release(hold.id);
  }

  /** Tras un hold vencido o sin cupo: la búsqueda original, para buscar de nuevo (sin perder lo escrito). */
  searchAgain(): string | null {
    const selection = this.deps.selection.load();
    this.endHold();
    return selection?.searchQuery ?? null;
  }

  /** Olvida el estado en memoria (otra compra, otra cuenta). */
  reset(): void {
    this.stopWatching?.();
    this.stopWatching = null;
    this.pending = null;
    this.state = initialState;
    for (const listener of this.listeners) listener(this.state);
  }
}
