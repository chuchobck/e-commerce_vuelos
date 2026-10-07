import { es } from '@/shared/i18n';
import { checkInWindow } from '@/shared/lib/checkin';
import { isValidEmail, normalizeEmail, normalizePassword, passwordLengthIssue } from '@/shared/lib/credentials';
import { addMoney } from '@/shared/lib/money';
import type { FlightsApi } from '../FlightsApi';
import { ApiError } from '../errors';
import { mapFlightStatus, mapOffer, mapSearchResponse, toAirportLocalIso, toSearchRequest } from '../mapping';
import type {
  AuthTokens,
  BoardingPass,
  Booking,
  CheckInRequest,
  CheckInResult,
  CreateBookingRequest,
  CreateHoldRequest,
  Credentials,
  FlightStatus,
  Hold,
  SearchParams,
  SearchResult,
  SeatMap,
  SelectedLeg,
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
import { HOLD_MINUTES } from './data/fares';
import { mockFlightStatus, mockOfferFromId, mockSearch, mockSeatMap } from './generators';
import { simulate } from './network';
import { randomCode, randomId, seeded } from './random';
import { refreshSeed, seedDb } from './seed';
import { hashPassword, loadDb, saveDb, type MockDb, type StoredUser } from './store';

function publicUser({ passwordHash: _hash, active: _active, ...user }: StoredUser): User {
  return user;
}

const notFound = (detail: string) => new ApiError({ status: 404, code: 'VALIDATION_FAILED', detail });
const conflict = (detail: string) => new ApiError({ status: 409, code: 'CONFLICT', detail });

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

  private refreshHoldStatus(hold: Hold): Hold {
    if (hold.status === 'ACTIVE' && new Date(hold.expiresAt).getTime() <= Date.now()) {
      hold.status = 'EXPIRED';
    }
    return hold;
  }

  async search(params: SearchParams): Promise<SearchResult> {
    await simulate('search', [429, 503]);
    return mapSearchResponse(mockSearch(toSearchRequest(params)), params);
  }

  async getSeatMap(offerId: string, segmentId: string): Promise<SeatMap> {
    await simulate('getSeatMap', [503]);
    return mockSeatMap(offerId, segmentId);
  }

  async getFlightStatus(flightNumber: string, date: string): Promise<FlightStatus> {
    await simulate('getFlightStatus', [503]);
    return mapFlightStatus(mockFlightStatus(flightNumber, date));
  }

  async createHold(request: CreateHoldRequest): Promise<Hold> {
    await simulate('createHold', [409, 503]);
    const dto = mockOfferFromId(request.offerId);
    if (!dto) throw new ApiError({ status: 409, code: 'OFFER_NO_LONGER_AVAILABLE', detail: 'Offer not found' });
    const offer = mapOffer(dto, request.passengers);
    const legs: SelectedLeg[] = request.itinerarySelections.map((sel) => {
      const itinerary = offer.itineraries.find((it) => it.id === sel.itineraryId);
      const fare = itinerary?.fares.find((f) => f.cabin === sel.cabinClass && f.brand === sel.fareBrand);
      if (!itinerary || !fare) throw new ApiError({ status: 409, code: 'OFFER_NO_LONGER_AVAILABLE', detail: 'Fare not available' });
      return { itinerary, fare };
    });
    const now = Date.now();
    const hold: Hold = {
      id: randomId('hold'),
      status: 'ACTIVE',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + HOLD_MINUTES * 60_000).toISOString(),
      offerId: offer.id,
      outbound: legs[0],
      inbound: legs[1],
      passengers: request.passengers,
      totalPrice: legs.map((l) => l.fare.total).reduce(addMoney),
    };
    this.commit((db) => db.holds.push(hold));
    return hold;
  }

  async getHold(holdId: string): Promise<Hold> {
    await simulate('getHold', [503]);
    const hold = this.db.holds.find((h) => h.id === holdId);
    if (!hold) throw notFound('Hold not found');
    this.commit(() => this.refreshHoldStatus(hold));
    return structuredClone(hold);
  }

  async cancelHold(holdId: string): Promise<void> {
    await simulate('cancelHold', [503]);
    this.commit((db) => {
      const hold = db.holds.find((h) => h.id === holdId);
      if (hold && hold.status === 'ACTIVE') hold.status = 'CANCELLED';
    });
  }

  async createBooking(request: CreateBookingRequest): Promise<Booking> {
    await simulate('createBooking', [409, 422, 503]);
    const hold = this.db.holds.find((h) => h.id === request.holdId);
    if (!hold) throw notFound('Hold not found');
    this.refreshHoldStatus(hold);
    if (hold.status !== 'ACTIVE') throw new ApiError({ status: 409, code: 'HOLD_EXPIRED', detail: 'Hold expired' });

    const expected = hold.passengers.adults + hold.passengers.children + hold.passengers.infants;
    if (request.passengers.length !== expected) {
      throw new ApiError({ status: 422, code: 'VALIDATION_FAILED', detail: 'Wrong number of passengers' });
    }

    const user = this.currentUser();
    const segment = hold.outbound.itinerary.segments[0];
    const seatMap = mockSeatMap(hold.offerId, segment.id);
    const free = (seatMap.cabins ?? [])
      .filter((c) => c.cabinClass === hold.outbound.fare.cabin)
      .flatMap((c) => c.rows ?? [])
      .flatMap((r) => r.seats ?? [])
      .filter((s) => s.isAvailable)
      .map((s) => s.seatNumber ?? '');

    const code = randomCode();
    const booking: Booking = {
      id: randomId('bkg'),
      code,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString(),
      outbound: hold.outbound,
      inbound: hold.inbound,
      passengers: request.passengers.map((p, i) => {
        const { seatId, ...rest } = p;
        return {
          ...rest,
          id: `pax_${code.toLowerCase()}_${i + 1}`,
          seat: p.type === 'INF' ? null : (seatId ?? free[i] ?? null),
          seatAutoAssigned: !seatId && p.type !== 'INF',
        };
      }),
      contact: request.contact,
      totalPaid: hold.totalPrice,
      userId: user?.id,
    };
    this.commit((db) => {
      const h = db.holds.find((x) => x.id === hold.id);
      if (h) h.status = 'CONVERTED';
      db.bookings.push(booking);
    });
    return booking;
  }

  async listBookings(): Promise<Booking[]> {
    await simulate('listBookings', [503]);
    const user = this.requireUser();
    const departure = (b: Booking) => new Date(b.outbound.itinerary.segments[0].departureTime).getTime();
    return this.db.bookings.filter((b) => b.userId === user.id).sort((a, b) => departure(a) - departure(b));
  }

  async getBooking(bookingIdOrCode: string): Promise<Booking> {
    await simulate('getBooking', [503]);
    const key = bookingIdOrCode.trim();
    const found = this.db.bookings.find((b) => b.id === key || b.code === key.toUpperCase());
    if (!found) throw notFound('Booking not found');
    return structuredClone(found);
  }

  async cancelBooking(bookingId: string): Promise<Booking> {
    await simulate('cancelBooking', [409, 503]);
    const found = this.db.bookings.find((b) => b.id === bookingId);
    if (!found) throw notFound('Booking not found');
    if (found.userId) {
      const user = this.requireUser();
      if (user.id !== found.userId) throw notFound('Booking not found');
    }
    if (found.status === 'CANCELLED') throw new ApiError({ status: 409, code: 'ALREADY_CANCELLED', detail: 'Already cancelled' });
    this.commit(() => {
      found.status = 'CANCELLED';
    });
    return structuredClone(found);
  }

  /** Reserva del usuario de la sesión. Como la API: sin sesión 401; ajena o inexistente 404. */
  private ownedBooking(bookingId: string): Booking {
    const user = this.requireUser();
    const found = this.db.bookings.find((b) => b.id === bookingId && b.userId === user.id);
    if (!found) throw notFound('Booking not found');
    return found;
  }

  private buildBoardingPasses(booking: Booking): BoardingPass[] {
    const seg = booking.outbound.itinerary.segments[0];
    const rand = seeded(`${booking.code}-gate`);
    const gate = String(1 + Math.floor(rand() * 14));
    const boardingTime = toAirportLocalIso(new Date(new Date(seg.departureTime).getTime() - 40 * 60_000).toISOString(), seg.origin);
    const group = booking.outbound.fare.brand === 'BASIC' ? '3' : booking.outbound.fare.brand === 'CLASSIC' ? '2' : '1';
    return booking.passengers
      .filter((p) => p.type !== 'INF')
      .map((p, i) => ({
        id: `bp_${p.id}`,
        bookingCode: booking.code,
        passengerName: `${p.firstName} ${p.lastName}`,
        flightNumber: seg.flightNumber,
        origin: seg.origin,
        destination: seg.destination,
        departureTime: seg.departureTime,
        boardingTime,
        gate,
        seat: p.seat ?? `${14 + i}C`,
        group,
        barcode: `M1${p.lastName.toUpperCase().replace(/\s/g, '')}/${booking.code}${seg.flightNumber}`,
      }));
  }

  async checkIn(request: CheckInRequest): Promise<CheckInResult> {
    await simulate('checkIn', [409, 503]);
    const booking = this.ownedBooking(request.bookingId);
    if (booking.status === 'CANCELLED') throw conflict('Booking cancelled');
    const checkin = checkInWindow(booking.outbound.itinerary.segments[0].departureTime);
    if (checkin.status !== 'open') {
      throw new ApiError({ status: 409, code: 'CHECK_IN_NOT_AVAILABLE', detail: es.checkin.notOpenError });
    }
    this.commit(() => {
      booking.status = 'CHECKED_IN';
      booking.passengers.forEach((p, i) => {
        if (p.type !== 'INF' && !p.seat) p.seat = `${14 + i}C`;
      });
    });
    return { booking: structuredClone(booking), boardingPasses: this.buildBoardingPasses(booking) };
  }

  async getBoardingPasses(bookingId: string): Promise<BoardingPass[]> {
    await simulate('getBoardingPasses', [503]);
    const booking = this.ownedBooking(bookingId);
    if (booking.status !== 'CHECKED_IN') throw new ApiError({ status: 409, code: 'BOARDING_PASS_NOT_AVAILABLE', detail: 'Not checked in' });
    return this.buildBoardingPasses(booking);
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
