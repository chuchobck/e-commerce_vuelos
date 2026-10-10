import { isValidEmail, normalizeEmail, normalizePassword, passwordLengthIssue } from '@/shared/lib/credentials';
import type { FlightsApi } from '../FlightsApi';
import { ApiError } from '../errors';
import {
  mapBaggageAdded,
  mapBaggageOptions,
  mapBoardingPasses,
  mapBooking,
  mapBookingList,
  mapCancellationQuote,
  mapCheckIn,
  mapDateChangeOptions,
  mapFlightStatus,
  mapHoldCreated,
  mapHoldStatus,
  mapSearchResponse,
  mapTicket,
  mapTicketList,
  toAddBaggageRequest,
  toBookingRequest,
  toCancelRequest,
  toDateChangeRequest,
  toDateChangeSearchRequest,
  toHoldRequest,
  toSearchRequest,
} from '../mapping';
import type {
  AddBaggageRequest,
  AuthTokens,
  BaggageAdded,
  BaggageOption,
  BoardingPass,
  BookedTicket,
  Booking,
  BookingPage,
  CancelRequest,
  CancellationQuote,
  CheckInResult,
  CreateBookingRequest,
  CreateHoldRequest,
  Credentials,
  DateChangeOption,
  DateChangeQuery,
  DateChangeRequest,
  FlightStatus,
  Hold,
  ListBookingsParams,
  PostSaleOutcome,
  SearchOptions,
  SearchParams,
  SearchResult,
  SeatMap,
  User,
} from '../types';
import {
  ACCESS_TOKEN_SECONDS,
  badRequest,
  CLIENT_SCOPES,
  issueAccessToken,
  newRefreshToken,
  REFRESH_TOKEN_SECONDS,
  unauthorized,
  userIdFromAccessToken,
} from './auth';
import { mockFlightStatus, mockSearch } from './generators';
import * as aftersale from './aftersale';
import * as purchase from './purchase';
import { simulate, simulated } from './network';
import { activeScenario, planFor } from './scenarios';
import { refreshSeed, seedDb } from './seed';
import { hashPassword, loadDb, saveDb, type MockDb, type StoredBooking, type StoredUser } from './store';

function publicUser({ passwordHash: _hash, active: _active, ...user }: StoredUser): User {
  return user;
}

const notFound = (detail: string) => new ApiError({ status: 404, code: 'VALIDATION_FAILED', detail });

/**
 * Implementación simulada de FlightsApi. Sin backend: todo vive en memoria y localStorage.
 * Búsqueda, mapa de asientos y estado de vuelo producen la forma del contrato (./generators.ts)
 * y pasan por el mismo mapeo que la API real. Latencia 300–800 ms y errores ocasionales.
 */
export class MockFlightsApi implements FlightsApi {
  /** El token de acceso lo pone la sesión (features/auth), igual que en la API real. */
  constructor(private readonly getAccessToken: () => string | undefined = () => undefined) {}

  private get db(): MockDb {
    return loadDb(seedDb, refreshSeed);
  }

  private commit(mutate: (db: MockDb) => void) {
    const db = this.db;
    mutate(db);
    saveDb(db);
  }

/** Usuario del token de acceso vigente, o null (sin sesión, vencido o cuenta inactiva). */
  private currentUser(): StoredUser | null {
    const id = userIdFromAccessToken(this.getAccessToken());
    return this.db.users.find((u) => u.id === id && u.active) ?? null;
  }

  /** Como la API: sin token válido, 401. */
  private requireUser(): StoredUser {
    const user = this.currentUser();
    if (!user) throw unauthorized('The access token is invalid');
    return user;
  }

  async search(params: SearchParams, options: SearchOptions = {}): Promise<SearchResult> {
    const plan = planFor(activeScenario(), params);
    await simulate('search', [429, 503], { signal: options.signal, randomErrors: !options.background, extraDelayMs: plan.extraDelayMs });
    if (plan.failure) throw simulated(plan.failure, 'search');
    const dto = mockSearch(toSearchRequest(params));
    return mapSearchResponse(plan.noFlights ? { ...dto, totalOffers: 0, offers: [] } : dto, params);
  }

  async getSeatMap(offerId: string, segmentId: string): Promise<SeatMap> {
    await simulate('getSeatMap', [503]);
    return purchase.seatMapOf(this.db, offerId, segmentId);
  }

  async getFlightStatus(flightNumber: string, date: string): Promise<FlightStatus> {
    await simulate('getFlightStatus', [503]);
    return mapFlightStatus(mockFlightStatus(flightNumber, date));
  }

  /* Compra: mismas reglas, respuestas y errores que la API (./purchase.ts), con la forma del contrato. */

  async createHold(request: CreateHoldRequest, idempotencyKey: string): Promise<Hold> {
    await simulate('createHold', [409, 503]);
    const user = this.requireUser();
    let dto!: ReturnType<typeof purchase.createHold>;
    this.commit((db) => (dto = purchase.createHold(db, user.id, toHoldRequest(request), idempotencyKey, Date.now())));
    return mapHoldCreated(dto, Date.now());
  }

  async getHold(holdId: string): Promise<Hold> {
    await simulate('getHold', [503]);
    const user = this.requireUser();
    let dto!: ReturnType<typeof purchase.getHold>;
    this.commit((db) => (dto = purchase.getHold(db, user.id, holdId, Date.now())));
    return mapHoldStatus(dto, holdId, Date.now());
  }

  async cancelHold(holdId: string): Promise<void> {
    await simulate('cancelHold', [503]);
    const user = this.requireUser();
    this.commit((db) => purchase.releaseHold(db, user.id, holdId, Date.now()));
  }

  async createBooking(request: CreateBookingRequest, idempotencyKey: string): Promise<Booking> {
    await simulate('createBooking', [503]);
    const user = this.requireUser();
    let dto!: ReturnType<typeof purchase.createBooking>;
    this.commit((db) => (dto = purchase.createBooking(db, user.id, toBookingRequest(request), idempotencyKey, Date.now())));
    return mapBooking(structuredClone(dto));
  }

  /** Reserva del usuario de la sesión. Como la API: sin sesión 401; ajena o inexistente 404. */
  private ownedBooking(db: MockDb, bookingId: string): StoredBooking {
    const user = this.requireUser();
    const found = db.bookings.find((b) => b.dto.bookingId === bookingId && b.ownerId === user.id);
    if (!found) throw notFound('Booking not found');
    return aftersale.settlePending(db, purchase.settleBooking(found, Date.now()), Date.now());
  }

  async getBooking(bookingId: string): Promise<Booking> {
    await simulate('getBooking', [503]);
    let dto!: StoredBooking['dto'];
    this.commit((db) => (dto = this.ownedBooking(db, bookingId).dto));
    return mapBooking(structuredClone(dto));
  }

  /* Postventa (F6): mismas reglas, respuestas y errores que la API (./aftersale.ts), con la forma del contrato. */

  async listBookings(params: ListBookingsParams = {}): Promise<BookingPage> {
    await simulate('listBookings', [503]);
    const user = this.requireUser();
    let dto!: ReturnType<typeof aftersale.listBookings>;
    this.commit((db) => {
      // Se resuelven las reservas con pago o proceso pendiente que ya maduraron antes de resumirlas.
      db.bookings.filter((b) => b.ownerId === user.id).forEach((b) => aftersale.settlePending(db, purchase.settleBooking(b, Date.now()), Date.now()));
      dto = aftersale.listBookings(db, user.id, params);
    });
    return mapBookingList(dto);
  }

  async getTickets(bookingId: string): Promise<BookedTicket[]> {
    await simulate('getTickets', [503]);
    let dto!: ReturnType<typeof aftersale.ticketsOf>;
    this.commit((db) => (dto = aftersale.ticketsOf(this.ownedBooking(db, bookingId))));
    return mapTicketList(structuredClone(dto));
  }

  async getTicket(bookingId: string, ticketId: string): Promise<BookedTicket> {
    await simulate('getTicket', [503]);
    let dto!: ReturnType<typeof aftersale.ticketOf>;
    this.commit((db) => (dto = aftersale.ticketOf(this.ownedBooking(db, bookingId), ticketId)));
    return mapTicket(structuredClone(dto));
  }

  async checkIn(bookingId: string, _idempotencyKey: string): Promise<CheckInResult> {
    await simulate('checkIn', [409, 503]);
    let dto!: ReturnType<typeof aftersale.checkIn>;
    this.commit((db) => (dto = aftersale.checkIn(this.ownedBooking(db, bookingId), Date.now())));
    return mapCheckIn(dto);
  }

  async getBoardingPasses(bookingId: string): Promise<BoardingPass[]> {
    await simulate('getBoardingPasses', [503]);
    let dto!: ReturnType<typeof aftersale.boardingPasses>;
    this.commit((db) => (dto = aftersale.boardingPasses(this.ownedBooking(db, bookingId))));
    return mapBoardingPasses(dto);
  }

  async getBaggageOptions(bookingId: string): Promise<BaggageOption[]> {
    await simulate('getBaggageOptions', [503]);
    let dto!: ReturnType<typeof aftersale.baggageOptions>;
    this.commit((db) => (dto = aftersale.baggageOptions(this.ownedBooking(db, bookingId))));
    return mapBaggageOptions(dto);
  }

  async addBaggage(bookingId: string, request: AddBaggageRequest, idempotencyKey: string): Promise<PostSaleOutcome<BaggageAdded>> {
    await simulate('addBaggage', [409, 422, 503]);
    const user = this.requireUser();
    let result!: ReturnType<typeof aftersale.addBaggage>;
    this.commit((db) => (result = aftersale.addBaggage(db, this.ownedBooking(db, bookingId), user.id, toAddBaggageRequest(request), idempotencyKey, Date.now())));
    return result.outcome === 'pending' ? { status: 'pending' } : { status: 'done', data: mapBaggageAdded(result.data, request) };
  }

  async searchDateChange(bookingId: string, changes: DateChangeQuery[]): Promise<DateChangeOption[]> {
    await simulate('searchDateChange', [409, 503]);
    const user = this.requireUser();
    let dto!: ReturnType<typeof aftersale.searchDateChange>;
    this.commit((db) => (dto = aftersale.searchDateChange(db, this.ownedBooking(db, bookingId), user.id, toDateChangeSearchRequest(changes), Date.now())));
    return mapDateChangeOptions(dto, 'USD');
  }

  async confirmDateChange(bookingId: string, request: DateChangeRequest, idempotencyKey: string): Promise<PostSaleOutcome<Booking | null>> {
    await simulate('confirmDateChange', [409, 422, 503]);
    const user = this.requireUser();
    let result!: ReturnType<typeof aftersale.confirmDateChange>;
    this.commit((db) => (result = aftersale.confirmDateChange(db, this.ownedBooking(db, bookingId), user.id, toDateChangeRequest(request), idempotencyKey, Date.now())));
    return result.outcome === 'pending' ? { status: 'pending' } : { status: 'done', data: mapBooking(structuredClone(result.data)) };
  }

  async getCancellationQuote(bookingId: string): Promise<CancellationQuote> {
    await simulate('getCancellationQuote', [503]);
    const user = this.requireUser();
    let dto!: ReturnType<typeof aftersale.cancellationQuote>;
    this.commit((db) => (dto = aftersale.cancellationQuote(db, this.ownedBooking(db, bookingId), user.id, Date.now())));
    return mapCancellationQuote(dto);
  }

  async cancelBooking(bookingId: string, request: CancelRequest, idempotencyKey: string): Promise<PostSaleOutcome<void>> {
    await simulate('cancelBooking', [409, 503]);
    const user = this.requireUser();
    let outcome!: ReturnType<typeof aftersale.cancelBooking>;
    this.commit((db) => (outcome = aftersale.cancelBooking(db, this.ownedBooking(db, bookingId), user.id, toCancelRequest(request), idempotencyKey, Date.now())));
    return outcome === 'pending' ? { status: 'pending' } : { status: 'done', data: undefined };
  }

  /* Cuenta: mismas reglas, respuestas y errores que /auth/* de la API. */

  /** Valida como los DTO del backend (400 por campo) y devuelve el correo normalizado. */
  private checkCredentials({ email, password }: Credentials): { email: string; password: string } {
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) throw badRequest('email', 'email must be an email');
    const issue = passwordLengthIssue(password);
    if (issue === 'short') throw badRequest('password', 'password must be longer than or equal to 12 characters');
    if (issue === 'long') throw badRequest('password', 'password must be shorter than or equal to 128 characters');
    return { email: normalized, password: normalizePassword(password) };
  }

  async register(credentials: Credentials): Promise<User> {
    await simulate('register', [429, 503]);
    const { email, password } = this.checkCredentials(credentials);
    if (this.db.users.some((u) => u.email === email)) {
      throw new ApiError({ status: 409, code: 'VALIDATION_FAILED', title: 'Conflict', detail: 'An account with this email already exists' });
    }
    const user: StoredUser = {
      id: crypto.randomUUID(),
      email,
      roles: ['cliente'],
      scopes: [...CLIENT_SCOPES],
      createdAt: new Date().toISOString(),
      passwordHash: await hashPassword(password),
      active: true,
    };
    this.commit((db) => db.users.push(user));
    return publicUser(user);
  }

  async login(credentials: Credentials): Promise<AuthTokens> {
    await simulate('login', [429, 503]);
    const { email, password } = this.checkCredentials(credentials);
    const user = this.db.users.find((u) => u.email === email);
    const hash = await hashPassword(password);
    // Correo inexistente, contraseña errónea y cuenta inactiva responden igual.
    if (!user || !user.active || user.passwordHash !== hash) throw unauthorized('Invalid email or password');
    return this.issueTokens(user, crypto.randomUUID());
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    await simulate('refresh', [503]);
    const stored = this.db.refreshTokens.find((t) => t.token === refreshToken);
    const invalid = () => unauthorized('The refresh token is invalid or expired');
    if (!stored || stored.revoked || new Date(stored.expiresAt).getTime() <= Date.now()) throw invalid();
    if (stored.replaced) {
      // Reutilización de un token ya rotado: alguien más lo tiene. Se revoca la familia completa.
      this.commit((db) => db.refreshTokens.filter((t) => t.family === stored.family).forEach((t) => (t.revoked = true)));
      throw invalid();
    }
    const user = this.db.users.find((u) => u.id === stored.userId && u.active);
    if (!user) throw invalid();
    this.commit(() => {
      stored.replaced = true;
    });
    return this.issueTokens(user, stored.family);
  }

  async logout(refreshToken: string): Promise<void> {
    await simulate('logout', [503]);
    const user = this.requireUser();
    const stored = this.db.refreshTokens.find((t) => t.token === refreshToken);
    // Siempre 204: un token ajeno o desconocido no se distingue de uno válido.
    if (!stored || stored.userId !== user.id) return;
    this.commit((db) => db.refreshTokens.filter((t) => t.family === stored.family).forEach((t) => (t.revoked = true)));
  }

  async me(): Promise<User> {
    await simulate('me', [503]);
    return publicUser(this.requireUser());
  }

  private issueTokens(user: StoredUser, family: string): AuthTokens {
    const refreshToken = newRefreshToken();
    this.commit((db) => {
      // Se descartan los vencidos para que el almacenamiento no crezca sin fin.
      db.refreshTokens = db.refreshTokens.filter((t) => new Date(t.expiresAt).getTime() > Date.now());
      db.refreshTokens.push({
        token: refreshToken,
        family,
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_SECONDS * 1000).toISOString(),
        replaced: false,
        revoked: false,
      });
    });
    return {
      accessToken: issueAccessToken(user.id, user.scopes),
      refreshToken,
      expiresIn: ACCESS_TOKEN_SECONDS,
      scope: user.scopes.join(' '),
    };
  }
}
