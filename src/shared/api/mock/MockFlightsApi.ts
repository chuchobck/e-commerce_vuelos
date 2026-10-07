import { es } from '@/shared/i18n';
import { checkInWindow } from '@/shared/lib/checkin';
import { addMoney } from '@/shared/lib/money';
import type { FlightsApi } from '../FlightsApi';
import { ApiError } from '../errors';
import { mapFlightStatus, mapOffer, mapSearchResponse, toAirportLocalIso, toSearchRequest } from '../mapping';
import type {
  AuthSession,
  BoardingPass,
  Booking,
  CheckInRequest,
  CheckInResult,
  CreateBookingRequest,
  CreateHoldRequest,
  FlightStatus,
  Hold,
  LoginRequest,
  RegisterRequest,
  SearchParams,
  SearchResult,
  SeatMap,
  SelectedLeg,
  User,
} from '../types';
import { HOLD_MINUTES } from './data/fares';
import { mockFlightStatus, mockOfferFromId, mockSearch, mockSeatMap } from './generators';
import { simulate } from './network';
import { randomCode, randomId, seeded } from './random';
import { refreshSeed, seedDb } from './seed';
import { hashPassword, loadDb, saveDb, type MockDb, type StoredUser } from './store';

const SESSION_HOURS = 12;

function publicUser({ passwordHash: _hash, ...user }: StoredUser): User {
  return user;
}

const notFound = (detail: string) => new ApiError({ status: 404, code: 'VALIDATION_FAILED', detail });
const unauthorized = () => new ApiError({ status: 401, code: 'VALIDATION_FAILED', detail: 'Invalid session' });
const conflict = (detail: string) => new ApiError({ status: 409, code: 'CONFLICT', detail });

/**
 * Implementación simulada de FlightsApi. Sin backend: todo vive en memoria y localStorage.
 * Búsqueda, mapa de asientos y estado de vuelo producen la forma del contrato (./generators.ts)
 * y pasan por el mismo mapeo que la API real. Latencia 300–800 ms y errores ocasionales.
 */
export class MockFlightsApi implements FlightsApi {
  private get db(): MockDb {
    return loadDb(seedDb, refreshSeed);
  }

  private commit(mutate: (db: MockDb) => void) {
    const db = this.db;
    mutate(db);
    saveDb(db);
  }

  private userFromToken(token: string | undefined): StoredUser | null {
    if (!token) return null;
    const session = this.db.sessions.find((s) => s.token === token);
    if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
    return this.db.users.find((u) => u.id === session.user.id) ?? null;
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

  async createBooking(request: CreateBookingRequest, token?: string): Promise<Booking> {
    await simulate('createBooking', [409, 422, 503]);
    const hold = this.db.holds.find((h) => h.id === request.holdId);
    if (!hold) throw notFound('Hold not found');
    this.refreshHoldStatus(hold);
    if (hold.status !== 'ACTIVE') throw new ApiError({ status: 409, code: 'HOLD_EXPIRED', detail: 'Hold expired' });

    const expected = hold.passengers.adults + hold.passengers.children + hold.passengers.infants;
    if (request.passengers.length !== expected) {
      throw new ApiError({ status: 422, code: 'VALIDATION_FAILED', detail: 'Wrong number of passengers' });
    }

    const user = this.userFromToken(token);
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

  async listBookings(token: string): Promise<Booking[]> {
    await simulate('listBookings', [503]);
    const user = this.userFromToken(token);
    if (!user) throw unauthorized();
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

  async cancelBooking(bookingId: string, token?: string): Promise<Booking> {
    await simulate('cancelBooking', [409, 503]);
    const found = this.db.bookings.find((b) => b.id === bookingId);
    if (!found) throw notFound('Booking not found');
    if (found.userId) {
      const user = this.userFromToken(token);
      if (!user || user.id !== found.userId) throw unauthorized();
    }
    if (found.status === 'CANCELLED') throw new ApiError({ status: 409, code: 'ALREADY_CANCELLED', detail: 'Already cancelled' });
    this.commit(() => {
      found.status = 'CANCELLED';
    });
    return structuredClone(found);
  }

  /** Reserva del usuario de la sesión. Como la API: sin sesión 401; ajena o inexistente 404. */
  private ownedBooking(bookingId: string, token: string | undefined): Booking {
    const user = this.userFromToken(token);
    if (!user) throw unauthorized();
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

  async checkIn(request: CheckInRequest, token?: string): Promise<CheckInResult> {
    await simulate('checkIn', [409, 503]);
    const booking = this.ownedBooking(request.bookingId, token);
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

  async getBoardingPasses(bookingId: string, token?: string): Promise<BoardingPass[]> {
    await simulate('getBoardingPasses', [503]);
    const booking = this.ownedBooking(bookingId, token);
    if (booking.status !== 'CHECKED_IN') throw new ApiError({ status: 409, code: 'BOARDING_PASS_NOT_AVAILABLE', detail: 'Not checked in' });
    return this.buildBoardingPasses(booking);
  }

  async login(request: LoginRequest): Promise<AuthSession> {
    await simulate('login', [503]);
    const user = this.db.users.find((u) => u.email.toLowerCase() === request.email.trim().toLowerCase());
    const hash = await hashPassword(request.password);
    if (!user || user.passwordHash !== hash) {
      throw new ApiError({ status: 401, code: 'INVALID_CREDENTIALS', detail: 'Invalid credentials' });
    }
    return this.openSession(user);
  }

  async register(request: RegisterRequest): Promise<AuthSession> {
    await simulate('register', [503]);
    const email = request.email.trim().toLowerCase();
    if (this.db.users.some((u) => u.email.toLowerCase() === email)) {
      throw new ApiError({ status: 409, code: 'EMAIL_TAKEN', detail: 'Email taken', fieldErrors: [{ field: 'email', message: 'taken' }] });
    }
    const { password, ...data } = request;
    const user: StoredUser = { ...data, email, id: randomId('usr'), passwordHash: await hashPassword(password) };
    this.commit((db) => db.users.push(user));
    return this.openSession(user);
  }

  private openSession(user: StoredUser): AuthSession {
    const session: AuthSession = {
      token: randomId('tok'),
      user: publicUser(user),
      expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString(),
    };
    this.commit((db) => {
      db.sessions = db.sessions.filter((s) => new Date(s.expiresAt).getTime() > Date.now());
      db.sessions.push(session);
    });
    return session;
  }
}
