/**
 * Sesión del usuario. Lógica pura, sin React: AuthProvider.tsx es solo el adaptador.
 *
 * Reglas (ver README, "Modelo de seguridad de la sesión"):
 * - Access token SOLO en memoria. Refresh token en sessionStorage, o en localStorage si el usuario
 *   marcó "Mantener mi sesión iniciada" (tokenStore.ts).
 * - Renovación de UNA petición a la vez (single-flight). Entre pestañas se serializa con un candado
 *   y, ya con el candado, se relee el almacén por si otra pestaña renovó. Nunca se envía un refresh
 *   token que ya se rotó (la API revocaría toda la sesión por "reutilización").
 * - Renovación proactiva poco antes de `exp` y reactiva ante un 401: se renueva una vez y se reintenta
 *   la petición una vez; un segundo 401 cierra la sesión.
 * - Si la renovación falla con 401/403 (vencido o reutilizado) la sesión se cierra "por seguridad".
 */
import { isApiError, type AuthTokens, type Credentials, type User } from '@/shared/api';
import { jwtExpiresAt } from '@/shared/lib/jwt';
import type { ChannelLike, LockLike, SessionMessage } from './crossTab';
import { fingerprint, type TokenStore } from './tokenStore';

export interface AuthApi {
  register(credentials: Credentials): Promise<User>;
  login(credentials: Credentials): Promise<AuthTokens>;
  refresh(refreshToken: string): Promise<AuthTokens>;
  logout(refreshToken: string): Promise<void>;
  me(): Promise<User>;
}

export type SessionStatus = 'restoring' | 'anonymous' | 'authenticated';
/** Por qué terminó una sesión sin que el usuario la cerrara en esta pestaña. */
export type SessionEndReason = 'security' | 'elsewhere';

export interface SessionState {
  status: SessionStatus;
  user: User | null;
  ended: SessionEndReason | null;
}

export interface SessionDeps {
  api: AuthApi;
  store: TokenStore;
  lock: LockLike;
  channel: ChannelLike;
  now?: () => number;
  /** Temporizador de la renovación proactiva (inyectable para pruebas). */
  schedule?: (fn: () => void, ms: number) => () => void;
  /** Espera corta para recibir el token nuevo de otra pestaña (inyectable para pruebas). */
  sleep?: (ms: number) => Promise<void>;
}

/** Margen antes de `exp` para renovar sin que ninguna petición llegue con el token vencido. */
export const REFRESH_SKEW_MS = 60_000;
const LOCK_NAME = 'quinde-auth-refresh';
const WAIT_FOR_OTHER_TAB_MS = 1_500;
const WAIT_STEP_MS = 100;

/** El registro funcionó pero el ingreso automático no: la cuenta existe y hay que ingresar a mano. */
export class AccountCreatedError extends Error {
  constructor(readonly cause: unknown) {
    super('Cuenta creada, ingreso fallido');
    this.name = 'AccountCreatedError';
  }
}

/** La sesión terminó y hay que volver a ingresar. */
export class SessionEndedError extends Error {
  constructor(readonly reason: SessionEndReason) {
    super(`Sesión terminada (${reason})`);
    this.name = 'SessionEndedError';
  }
}

const isAuthRejection = (error: unknown) => isApiError(error) && (error.status === 401 || error.status === 403);

export class SessionManager {
  private state: SessionState = { status: 'restoring', user: null, ended: null };
  private access: { token: string; expiresAt: number } | null = null;
  private inflight: Promise<void> | null = null;
  private cancelTimer: (() => void) | null = null;
  private readonly listeners = new Set<(state: SessionState) => void>();
  private readonly tabId = Math.random().toString(36).slice(2);
  private readonly now: () => number;
  private readonly schedule: (fn: () => void, ms: number) => () => void;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly stopListening: () => void;

  constructor(private readonly deps: SessionDeps) {
    this.now = deps.now ?? Date.now;
    this.schedule =
      deps.schedule ??
      ((fn, ms) => {
        const id = setTimeout(fn, ms);
        return () => clearTimeout(id);
      });
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.stopListening = deps.channel.listen((message) => this.onMessage(message));
  }

  /* ----------------------------------- lectura del estado ----------------------------------- */

  getState = (): SessionState => this.state;

  subscribe = (listener: (state: SessionState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Token de acceso vigente para el cliente HTTP (nunca sale de la memoria). */
  getAccessToken = (): string | undefined => this.access?.token;

  /* ----------------------------------------- acciones ---------------------------------------- */

  private restoring: Promise<void> | null = null;

  /** Al cargar la app (una sola vez aunque se llame dos): con un refresh token guardado, renueva y pide /auth/me. */
  restore(): Promise<void> {
    this.restoring ??= this.doRestore();
    return this.restoring;
  }

  private async doRestore(): Promise<void> {
    if (!this.deps.store.read()) {
      this.setState({ status: 'anonymous', user: null, ended: null });
      return;
    }
    this.setState({ ...this.state, status: 'restoring' });
    try {
      await this.refresh();
      const user = await this.authorized(() => this.deps.api.me());
      this.setState({ status: 'authenticated', user, ended: null });
    } catch (error) {
      // Sin conexión o servidor caído: el token queda guardado para el próximo intento.
      if (!(error instanceof SessionEndedError) && !isAuthRejection(error)) {
        this.access = null;
        this.setState({ status: 'anonymous', user: null, ended: null });
      }
    }
  }

  async login(credentials: Credentials, persistent: boolean): Promise<User> {
    const tokens = await this.deps.api.login(credentials);
    this.deps.store.write(tokens.refreshToken, persistent);
    this.setAccess(tokens);
    const user = await this.authorized(() => this.deps.api.me());
    this.setState({ status: 'authenticated', user, ended: null });
    return user;
  }

  /** La API no entrega tokens al registrar: se crea la cuenta y después se ingresa. */
  async register(credentials: Credentials, persistent: boolean): Promise<User> {
    await this.deps.api.register(credentials);
    try {
      return await this.login(credentials, persistent);
    } catch (error) {
      throw new AccountCreatedError(error);
    }
  }

  /** Cierra la sesión en la API y en todas las pestañas. Si la API falla, igual se cierra aquí. */
  async logout(): Promise<void> {
    const user = this.state.user;
    try {
      if (this.deps.store.read()) {
        await this.authorized(() => this.deps.api.logout(this.deps.store.read() ?? ''));
      }
    } catch {
      /* sin conexión o token ya inválido: la sesión local se cierra igual */
    }
    this.clearLocal();
    if (user) this.deps.channel.post({ type: 'logout', from: this.tabId, userId: user.id });
    this.setState({ status: 'anonymous', user: null, ended: null });
  }

  /**
   * Ejecuta una petición con sesión: renueva antes si el token está por vencer y, ante un 401,
   * renueva una vez y reintenta una vez. Un segundo 401 cierra la sesión.
   */
  async authorized<T>(call: () => Promise<T>): Promise<T> {
    await this.ensureFresh();
    const used = this.access?.token;
    try {
      return await call();
    } catch (error) {
      if (!isAuthRejection(error)) throw error;
      // Si otra petición ya renovó mientras esta esperaba, solo se reintenta.
      if (!this.access || this.access.token === used) await this.refresh();
      try {
        return await call();
      } catch (second) {
        if (isAuthRejection(second)) this.expire('security');
        throw second;
      }
    }
  }

  /** Renueva si no hay token o vence en menos de un minuto. */
  async ensureFresh(): Promise<void> {
    if (!this.access || this.access.expiresAt - this.now() < REFRESH_SKEW_MS) await this.refresh();
  }

  /** Renovación single-flight: todas las peticiones comparten la misma promesa en curso. */
  refresh(): Promise<void> {
    if (this.inflight) return this.inflight;
    const known = this.access?.token;
    this.inflight = this.deps.lock
      .request(LOCK_NAME, () => this.refreshWithLock(known))
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  dispose(): void {
    this.cancelTimer?.();
    this.stopListening();
  }

  /* ---------------------------------------- internos ----------------------------------------- */

  private async refreshWithLock(known: string | undefined): Promise<void> {
    // Mientras esperábamos el candado, otra pestaña pudo renovar y avisarnos.
    if (this.access && this.access.token !== known && this.access.expiresAt - this.now() >= REFRESH_SKEW_MS) return;

    // Releer SIEMPRE el almacén con el candado tomado: es la copia más nueva.
    let token = this.deps.store.read();
    if (token && this.deps.store.wasRotated(token)) token = await this.waitForReplacement(token);
    if (!token) {
      // Sin token: otra pestaña cerró la sesión. Si aquí no había sesión, no hay nada que avisar.
      this.expire('elsewhere', !!this.state.user);
      throw new SessionEndedError('elsewhere');
    }

    let tokens: AuthTokens;
    try {
      tokens = await this.deps.api.refresh(token);
    } catch (error) {
      if (isAuthRejection(error)) {
        this.expire('security');
        throw new SessionEndedError('security');
      }
      throw error;
    }
    this.deps.store.markRotated(token);
    this.deps.store.replace(tokens.refreshToken);
    this.setAccess(tokens);
    this.deps.channel.post({
      type: 'rotated',
      from: this.tabId,
      userId: this.state.user?.id ?? null,
      previous: fingerprint(token),
      tokens,
    });
  }

  /**
   * Nuestra copia del refresh token ya fue rotada por otra pestaña (p. ej. una pestaña duplicada
   * que comparte sessionStorage). Se espera un momento el aviso con el token nuevo; usar la copia
   * vieja haría que la API revoque toda la sesión.
   */
  private async waitForReplacement(stale: string): Promise<string | null> {
    // Intentos contados (no por reloj): termina aunque el reloj del sistema no avance.
    for (let attempt = 0; attempt < WAIT_FOR_OTHER_TAB_MS / WAIT_STEP_MS; attempt++) {
      await this.sleep(WAIT_STEP_MS);
      const current = this.deps.store.read();
      if (current && current !== stale) return current;
    }
    return null;
  }

  private setAccess(tokens: AuthTokens): void {
    // `expires_in` es relativo al momento de recibirlo: no depende de que el reloj del equipo coincida
    // con el del servidor. El `exp` del JWT es absoluto; con un reloj adelantado, cada token nuevo
    // parecería vencido y se renovaría en bucle. Solo se usa si falta `expires_in`.
    const lifetime =
      Number.isFinite(tokens.expiresIn) && tokens.expiresIn > 0
        ? tokens.expiresIn * 1000
        : Math.max(0, (jwtExpiresAt(tokens.accessToken) ?? 0) - this.now());
    this.access = { token: tokens.accessToken, expiresAt: this.now() + lifetime };
    this.cancelTimer?.();
    this.cancelTimer = null;
    if (lifetime === 0) return;
    // Renovación proactiva: un poco antes del margen, para no esperar a que una petición falle;
    // nunca antes de media vida, para que un token muy corto no provoque renovaciones seguidas.
    const delay = Math.max(lifetime / 2, lifetime - REFRESH_SKEW_MS - 5_000);
    this.cancelTimer = this.schedule(() => {
      void this.refresh().catch(() => undefined);
    }, delay);
  }

  private onMessage(message: SessionMessage): void {
    if (message.from === this.tabId) return;
    if (message.type === 'rotated') {
      const stored = this.deps.store.read();
      // Una pestaña duplicada con la copia vieja en su sessionStorage la reemplaza.
      if (stored && fingerprint(stored) === message.previous) this.deps.store.replace(message.tokens.refreshToken);
      const sameUser = !message.userId || message.userId === this.state.user?.id;
      if (sameUser && this.state.status !== 'anonymous') this.setAccess(message.tokens);
      return;
    }
    if (message.type === 'logout' && this.state.user?.id === message.userId) {
      this.clearLocal();
      this.setState({ status: 'anonymous', user: null, ended: 'elsewhere' });
    }
  }

  /** La sesión terminó sola (token vencido o reutilizado): se limpia todo y se avisa. */
  private expire(reason: SessionEndReason, notify = true): void {
    const user = this.state.user;
    this.clearLocal();
    if (user) this.deps.channel.post({ type: 'logout', from: this.tabId, userId: user.id });
    this.setState({ status: 'anonymous', user: null, ended: notify ? reason : null });
  }

  private clearLocal(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.access = null;
    this.deps.store.clear();
  }

  private setState(next: SessionState): void {
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }
}
