import type { FlightsApi } from '../FlightsApi';
import { ApiError } from '../errors';
import type {
  Airport,
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
  User,
} from '../types';
import { AIRPORTS, findAirport, UTC_OFFSET_MINUTES } from './data/airports';
import { HOLD_MINUTES } from './data/fares';
import { findSegment, generateFlightStatus, generateOffers, generateSeatMap, offerFromId } from './generators';
import { latency, simulate } from './network';
import { randomCode, randomId, round2, seeded, toZonedIso } from './random';
import { refreshSeed, seedDb } from './seed';
import { hashPassword, loadDb, saveDb, type MockDb, type StoredUser } from './store';

const SESSION_HOURS = 12;

function publicUser({ passwordHash: _hash, ...user }: StoredUser): User {
  return user;
}

/**
 * Implementación simulada de FlightsApi. Sin backend: todo vive en memoria y localStorage.
 * Latencia 300–800 ms y errores ocasionales 409 / 422 / 503 (ver ./network.ts).
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

  async listAirports(): Promise<Airport[]> {
    await latency(150, 300);
    return [...AIRPORTS].sort((a, b) => a.city.localeCompare(b.city, 'es'));
  }

  async search(params: SearchParams): Promise<SearchResult> {
    await simulate('search', [503]);
    if (!findAirport(params.origin) || !findAirport(params.destination) || params.origin === params.destination) {
      throw new ApiError(422, 'VALIDATION', 'Origen o destino inválido', [{ field: 'destination', message: 'invalid' }]);
    }
    const outbound = generateOffers(params.origin, params.destination, params.departDate, params.cabin, params.passengers);
    const inbound = params.returnDate
      ? generateOffers(params.destination, params.origin, params.returnDate, params.cabin, params.passengers)
      : [];
    return { searchId: randomId('srch'), params, outbound, inbound };
  }

  async createHold(request: CreateHoldRequest): Promise<Hold> {
    await simulate('createHold', [409, 503]);
    const pick = (sel: { offerId: string; fareId: string }) => {
      const offer = offerFromId(sel.offerId, request.passengers);
      const fare = offer?.fares.find((f) => f.id === sel.fareId);
      if (!offer || !fare) throw new ApiError(409, 'FARE_UNAVAILABLE', 'La tarifa ya no está disponible');
      return { offer, fare };
    };
    const outbound = pick(request.outbound);
    const inbound = request.inbound ? pick(request.inbound) : undefined;
    const now = Date.now();
    const hold: Hold = {
      id: randomId('hold'),
      status: 'ACTIVE',
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + HOLD_MINUTES * 60_000).toISOString(),
      outbound,
      inbound,
      passengers: request.passengers,
      totalPrice: round2(outbound.fare.totalPrice + (inbound?.fare.totalPrice ?? 0)),
      currency: 'USD',
    };
    this.commit((db) => db.holds.push(hold));
    return hold;
  }

  async getHold(holdId: string): Promise<Hold> {
    await simulate('getHold', [503]);
    const hold = this.db.holds.find((h) => h.id === holdId);
    if (!hold) throw new ApiError(404, 'NOT_FOUND', 'Hold no encontrado');
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

  async getSeatMap(flightNumber: string, date: string): Promise<SeatMap> {
    await simulate('getSeatMap', [503]);
    if (!findSegment(flightNumber, date)) throw new ApiError(404, 'NOT_FOUND', 'Vuelo no encontrado');
    return generateSeatMap(flightNumber, date);
  }

  async createBooking(request: CreateBookingRequest, token?: string): Promise<Booking> {
    await simulate('createBooking', [409, 422, 503]);
    const hold = this.db.holds.find((h) => h.id === request.holdId);
    if (!hold) throw new ApiError(404, 'NOT_FOUND', 'Hold no encontrado');
    this.refreshHoldStatus(hold);
    if (hold.status !== 'ACTIVE') throw new ApiError(409, 'HOLD_EXPIRED', 'El tiempo de reserva terminó');

    const expected = hold.passengers.adults + hold.passengers.children + hold.passengers.infants;
    if (request.passengers.length !== expected) {
      throw new ApiError(422, 'VALIDATION', 'Número de pasajeros incorrecto');
    }

    const user = this.userFromToken(token);
    const seatMap = generateSeatMap(hold.outbound.offer.segments[0].flightNumber, hold.outbound.offer.segments[0].departureTime.slice(0, 10));
    const free = seatMap.rows.flatMap((r) => r.seats).filter((s) => s.status === 'AVAILABLE' && s.kind === 'STANDARD');

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
        const auto = !seatId && p.type !== 'INF';
        return {
          ...rest,
          id: `pax_${code.toLowerCase()}_${i + 1}`,
          seat: p.type === 'INF' ? null : (seatId ?? free[i]?.id ?? null),
          seatAutoAssigned: auto,
        };
      }),
      contact: request.contact,
      totalPaid: hold.totalPrice,
      currency: 'USD',
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
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Sesión inválida');
    return this.db.bookings
      .filter((b) => b.userId === user.id)
      .sort((a, b) => a.outbound.offer.segments[0].departureTime.localeCompare(b.outbound.offer.segments[0].departureTime));
  }

  async getBooking(bookingIdOrCode: string): Promise<Booking> {
    await simulate('getBooking', [503]);
    const key = bookingIdOrCode.trim();
    const found = this.db.bookings.find((b) => b.id === key || b.code === key.toUpperCase());
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Reserva no encontrada');
    return structuredClone(found);
  }

  async cancelBooking(bookingId: string, token?: string): Promise<Booking> {
    await simulate('cancelBooking', [409, 503]);
    const found = this.db.bookings.find((b) => b.id === bookingId);
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Reserva no encontrada');
    if (found.userId) {
      const user = this.userFromToken(token);
      if (!user || user.id !== found.userId) throw new ApiError(401, 'UNAUTHORIZED', 'Ingresa para cancelar');
    }
    if (found.status === 'CANCELLED') throw new ApiError(409, 'CONFLICT', 'La reserva ya estaba cancelada');
    this.commit(() => {
      found.status = 'CANCELLED';
    });
    return structuredClone(found);
  }

  /** Reserva del usuario de la sesi\u00f3n. Como la API: sin sesi\u00f3n 401; ajena o inexistente 404. */
  private ownedBooking(bookingId: string, token: string | undefined): Booking {
    const user = this.userFromToken(token);
    if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Sesi\u00f3n inv\u00e1lida');
    const found = this.db.bookings.find((b) => b.id === bookingId && b.userId === user.id);
    if (!found) throw new ApiError(404, 'NOT_FOUND', 'Reserva no encontrada');
    return found;
  }

  private buildBoardingPasses(booking: Booking): BoardingPass[] {
    const seg = booking.outbound.offer.segments[0];
    const rand = seeded(`${booking.code}-gate`);
    const gate = String(1 + Math.floor(rand() * 14));
    const originAirport = findAirport(seg.origin);
    const offset = originAirport ? UTC_OFFSET_MINUTES[originAirport.timeZone] : -300;
    const boardingTime = toZonedIso(new Date(seg.departureTime).getTime() - 40 * 60_000, offset);
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
        group: booking.outbound.fare.family === 'FLEX' ? '1' : booking.outbound.fare.family === 'CLASSIC' ? '2' : '3',
        barcode: `M1${p.lastName.toUpperCase().replace(/\s/g, '')}/${booking.code}${seg.flightNumber}`,
      }));
  }

  async checkIn(request: CheckInRequest, token?: string): Promise<CheckInResult> {
    await simulate('checkIn', [409, 503]);
    const booking = this.ownedBooking(request.bookingId, token);
    if (booking.status === 'CANCELLED') throw new ApiError(409, 'CONFLICT', 'La reserva está cancelada');
    const dep = new Date(booking.outbound.offer.segments[0].departureTime).getTime();
    const diff = dep - Date.now();
    if (diff > 24 * 3_600_000) {
      throw new ApiError(409, 'CHECKIN_WINDOW', 'El check-in abre 24 horas antes de la salida. Vuelve más cerca de la fecha de tu vuelo.');
    }
    if (diff < 3_600_000) {
      throw new ApiError(409, 'CHECKIN_WINDOW', 'El check-in en línea cerró 1 hora antes de la salida. Acércate al mostrador del aeropuerto.');
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
    if (booking.status !== 'CHECKED_IN') throw new ApiError(409, 'CONFLICT', 'Aún no has hecho el check-in');
    return this.buildBoardingPasses(booking);
  }

  async getFlightStatus(flightNumber: string, date: string): Promise<FlightStatus> {
    await simulate('getFlightStatus', [503]);
    const segment = findSegment(flightNumber, date);
    if (!segment) throw new ApiError(404, 'NOT_FOUND', 'Vuelo no encontrado');
    return generateFlightStatus(segment, date);
  }

  async login(request: LoginRequest): Promise<AuthSession> {
    await simulate('login', [503]);
    const user = this.db.users.find((u) => u.email.toLowerCase() === request.email.trim().toLowerCase());
    const hash = await hashPassword(request.password);
    if (!user || user.passwordHash !== hash) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
    }
    return this.openSession(user);
  }

  async register(request: RegisterRequest): Promise<AuthSession> {
    await simulate('register', [503]);
    const email = request.email.trim().toLowerCase();
    if (this.db.users.some((u) => u.email.toLowerCase() === email)) {
      throw new ApiError(409, 'EMAIL_TAKEN', 'Correo ya registrado', [{ field: 'email', message: 'taken' }]);
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
