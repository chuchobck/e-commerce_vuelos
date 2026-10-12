import type {
  BaggageAddedDto,
  BaggageOptionDto,
  BoardingPassListDto,
  BookingDetailDto,
  BookingListDto,
  CancellationQuoteDto,
  CheckInResponseDto,
  DateChangeOptionDto,
  FlightStatusDto,
  HoldResponseDto,
  HoldStatusDto,
  SearchResponseDto,
  SeatMapDto,
  TicketDto,
  TicketListDto,
  TokenResponseDto,
  UserResponseDto,
} from './contract';
import type { FlightsApi } from './FlightsApi';
import type { HttpClient } from './http/client';
import { deviceFingerprint } from './http/deviceFingerprint';
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
  mapTokens,
  mapUser,
  toAddBaggageRequest,
  toBookingRequest,
  toCancelRequest,
  toDateChangeRequest,
  toDateChangeSearchRequest,
  toHoldRequest,
  toSearchRequest,
} from './mapping';
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
} from './types';

/** DISCREPANCIA: los importes de postventa que llegan sin moneda se asumen en dólares (toda la API vende en USD). */
const CURRENCY = 'USD';

/**
 * Implementación contra la API real: las operaciones públicas (búsqueda, mapa de asientos y
 * estado de vuelo, F2), la cuenta (F3), la compra (hold y reserva, F4a) y la postventa (F6). Las escrituras
 * no se reintentan solas y llevan Idempotency-Key.
 */
export class RealFlightsApi implements FlightsApi {
  constructor(private readonly http: HttpClient) {}

  async search(params: SearchParams, options: SearchOptions = {}): Promise<SearchResult> {
    // POST de solo lectura: admite el reintento de lecturas.
    const dto = await this.http.request<SearchResponseDto>('POST', '/search', {
      body: toSearchRequest(params),
      headers: { 'X-Device-Fingerprint': deviceFingerprint() },
      retry: options.retry ?? true,
      signal: options.signal,
    });
    return mapSearchResponse(dto, params);
  }

  getSeatMap(offerId: string, segmentId: string): Promise<SeatMap> {
    return this.http.request<SeatMapDto>('GET', `/offers/${encodeURIComponent(offerId)}/seatmap`, {
      query: { segmentId },
      retry: true,
    });
  }

  async getFlightStatus(flightNumber: string, date: string): Promise<FlightStatus> {
    const dto = await this.http.request<FlightStatusDto>('GET', `/flights/${encodeURIComponent(flightNumber)}/status`, {
      query: { date },
      retry: true,
    });
    return mapFlightStatus(dto);
  }

  /* Cuenta. Las escrituras no se reintentan solas; /auth/me es una lectura. */

  async register({ email, password }: Credentials): Promise<User> {
    return mapUser(await this.http.request<UserResponseDto>('POST', '/auth/register', { body: { email, password } }));
  }

  async login({ email, password }: Credentials): Promise<AuthTokens> {
    return mapTokens(await this.http.request<TokenResponseDto>('POST', '/auth/login', { body: { email, password } }));
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    return mapTokens(await this.http.request<TokenResponseDto>('POST', '/auth/refresh', { body: { refresh_token: refreshToken } }));
  }

  async logout(refreshToken: string): Promise<void> {
    await this.http.request('POST', '/auth/logout', { body: { refresh_token: refreshToken }, auth: true });
  }

  async me(): Promise<User> {
    return mapUser(await this.http.request<UserResponseDto>('GET', '/auth/me', { auth: true, retry: true }));
  }

  /** GET /health sin aviso de "despertando": despierta el servidor mientras el usuario escribe. */
  async warmUp(): Promise<void> {
    await this.http.request('GET', '/health', { silent: true });
  }

  /* Compra. Las escrituras nunca se reintentan solas: el reintento lo decide la compra con la misma clave. */

  async createHold(request: CreateHoldRequest, idempotencyKey: string): Promise<Hold> {
    const dto = await this.http.request<HoldResponseDto>('POST', '/offers/hold', {
      body: toHoldRequest(request),
      headers: { 'Idempotency-Key': idempotencyKey },
      auth: true,
    });
    return mapHoldCreated(dto, Date.now());
  }

  async getHold(holdId: string): Promise<Hold> {
    const dto = await this.http.request<HoldStatusDto>('GET', `/offers/hold/${encodeURIComponent(holdId)}`, { auth: true, retry: true });
    return mapHoldStatus(dto, holdId, Date.now());
  }

  async cancelHold(holdId: string): Promise<void> {
    await this.http.request('DELETE', `/offers/hold/${encodeURIComponent(holdId)}`, { auth: true });
  }

  async createBooking(request: CreateBookingRequest, idempotencyKey: string): Promise<Booking> {
    const dto = await this.http.request<BookingDetailDto>('POST', '/bookings', {
      body: toBookingRequest(request),
      headers: { 'Idempotency-Key': idempotencyKey },
      auth: true,
    });
    return mapBooking(dto);
  }

  async getBooking(bookingId: string): Promise<Booking> {
    return mapBooking(await this.http.request<BookingDetailDto>('GET', `/bookings/${encodeURIComponent(bookingId)}`, { auth: true, retry: true }));
  }

  /* Postventa. Las lecturas pueden reintentarse una vez; las escrituras nunca. */

  async listBookings({ cursor, limit }: ListBookingsParams = {}): Promise<BookingPage> {
    const query: Record<string, string> = {};
    if (cursor) query.cursor = cursor;
    if (limit) query.limit = String(limit);
    return mapBookingList(await this.http.request<BookingListDto>('GET', '/bookings', { auth: true, retry: true, query }));
  }

  async getTickets(bookingId: string): Promise<BookedTicket[]> {
    return mapTicketList(await this.http.request<TicketListDto>('GET', `/bookings/${encodeURIComponent(bookingId)}/tickets`, { auth: true, retry: true }));
  }

  async getTicket(bookingId: string, ticketId: string): Promise<BookedTicket> {
    const path = `/bookings/${encodeURIComponent(bookingId)}/tickets/${encodeURIComponent(ticketId)}`;
    return mapTicket(await this.http.request<TicketDto>('GET', path, { auth: true, retry: true }));
  }

  async checkIn(bookingId: string, idempotencyKey: string): Promise<CheckInResult> {
    // DISCREPANCIA: el contrato no declara Idempotency-Key en el check-in; se envía igual (una cabecera de más no estorba).
    const dto = await this.http.request<CheckInResponseDto>('POST', `/bookings/${encodeURIComponent(bookingId)}/check-in`, {
      headers: { 'Idempotency-Key': idempotencyKey },
      auth: true,
    });
    return mapCheckIn(dto);
  }

  async getBoardingPasses(bookingId: string): Promise<BoardingPass[]> {
    return mapBoardingPasses(await this.http.request<BoardingPassListDto>('GET', `/bookings/${encodeURIComponent(bookingId)}/boarding-passes`, { auth: true, retry: true }));
  }

  async getBaggageOptions(bookingId: string): Promise<BaggageOption[]> {
    return mapBaggageOptions(await this.http.request<BaggageOptionDto[]>('GET', `/bookings/${encodeURIComponent(bookingId)}/baggage-options`, { auth: true, retry: true }));
  }

  async addBaggage(bookingId: string, request: AddBaggageRequest, idempotencyKey: string): Promise<PostSaleOutcome<BaggageAdded>> {
    const { status, body } = await this.http.requestWithStatus<BaggageAddedDto>('POST', `/bookings/${encodeURIComponent(bookingId)}/baggage`, {
      body: toAddBaggageRequest(request),
      headers: { 'Idempotency-Key': idempotencyKey },
      auth: true,
    });
    return status === 202 ? { status: 'pending' } : { status: 'done', data: mapBaggageAdded(body, request) };
  }

  async searchDateChange(bookingId: string, changes: DateChangeQuery[]): Promise<DateChangeOption[]> {
    // POST de solo lectura: admite el reintento de lecturas.
    const dto = await this.http.request<DateChangeOptionDto[]>('POST', `/bookings/${encodeURIComponent(bookingId)}/date-change/search`, {
      body: toDateChangeSearchRequest(changes),
      auth: true,
      retry: true,
    });
    return mapDateChangeOptions(dto ?? [], CURRENCY);
  }

  async confirmDateChange(bookingId: string, request: DateChangeRequest, idempotencyKey: string): Promise<PostSaleOutcome<Booking | null>> {
    const { status, body } = await this.http.requestWithStatus<BookingDetailDto>('POST', `/bookings/${encodeURIComponent(bookingId)}/date-change`, {
      body: toDateChangeRequest(request),
      headers: { 'Idempotency-Key': idempotencyKey },
      auth: true,
    });
    if (status === 202) return { status: 'pending' };
    return { status: 'done', data: body?.bookingId ? mapBooking(body) : null };
  }

  async getCancellationQuote(bookingId: string): Promise<CancellationQuote> {
    return mapCancellationQuote(await this.http.request<CancellationQuoteDto>('GET', `/bookings/${encodeURIComponent(bookingId)}/cancellation-quote`, { auth: true, retry: true }));
  }

  async cancelBooking(bookingId: string, request: CancelRequest, idempotencyKey: string): Promise<PostSaleOutcome<void>> {
    const { status } = await this.http.requestWithStatus('POST', `/bookings/${encodeURIComponent(bookingId)}/cancel`, {
      body: toCancelRequest(request),
      headers: { 'Idempotency-Key': idempotencyKey },
      auth: true,
    });
    return status === 202 ? { status: 'pending' } : { status: 'done', data: undefined };
  }
}
