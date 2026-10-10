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
  SearchParams,
  SearchResult,
  SeatMap,
  User,
} from './types';

/**
 * Contrato único entre la interfaz y el proveedor de datos de vuelos.
 *
 * Dos implementaciones: `MockFlightsApi` (VITE_API_URL vacía) y `RealFlightsApi` (con valor).
 * Las operaciones públicas (search, getSeatMap, getFlightStatus) reciben y devuelven tipos que
 * derivan del contrato (./contract.ts → ./mapping.ts): las dos implementaciones producen la forma
 * del contrato y la mapean con las mismas funciones.
 *
 * Sesión: las operaciones con sesión NO reciben el token; cada implementación lo toma del proveedor
 * de token de acceso (./authBridge.ts), que registra el módulo de sesión (features/auth).
 *
 * Errores: toda implementación lanza `ApiError` (./errors.ts).
 */
export interface FlightsApi {
  /** POST /search. Ida y vuelta va en una sola búsqueda con dos tramos. */
  search(params: SearchParams): Promise<SearchResult>;
  /** GET /offers/{offerId}/seatmap?segmentId=… (la pantalla llega en F5). */
  getSeatMap(offerId: string, segmentId: string): Promise<SeatMap>;
  /** GET /flights/{flightNumber}/status?date=yyyy-MM-dd (fecha local de salida). */
  getFlightStatus(flightNumber: string, date: string): Promise<FlightStatus>;

  /* Cuenta (F3). */

  /** POST /auth/register. Devuelve el usuario, NO tokens: después hay que ingresar. 409 si el correo existe. */
  register(credentials: Credentials): Promise<User>;
  /** POST /auth/login. 401 genérico (correo o contraseña incorrectos). */
  login(credentials: Credentials): Promise<AuthTokens>;
  /** POST /auth/refresh. Rota el refresh token; reusar uno ya rotado revoca la sesión (401). */
  refresh(refreshToken: string): Promise<AuthTokens>;
  /** POST /auth/logout (con sesión). Revoca la familia del refresh token. */
  logout(refreshToken: string): Promise<void>;
  /** GET /auth/me (con sesión). */
  me(): Promise<User>;

  /* Compra (F4a). Las dos escrituras llevan Idempotency-Key (una por intención; ver features/checkout). */

  /** POST /offers/hold. 409 sin cupo o con la oferta vencida; 422 si la selección no es de la oferta. */
  createHold(request: CreateHoldRequest, idempotencyKey: string): Promise<Hold>;
  /** GET /offers/hold/{id}: estado y segundos restantes según el servidor. 404 si no es del usuario. */
  getHold(holdId: string): Promise<Hold>;
  /** DELETE /offers/hold/{id}. Liberar uno vencido o liberado es 204; uno ya usado en una reserva, 409. */
  cancelHold(holdId: string): Promise<void>;

  /**
   * POST /bookings. Pago aprobado: CONFIRMED con boletos (201). Pendiente: PENDING_PAYMENT (202).
   * Rechazado: 422 PAYMENT_NOT_AUTHORIZED y el hold sigue. Hold vencido o liberado: 410; ya usado: 409.
   */
  createBooking(request: CreateBookingRequest, idempotencyKey: string): Promise<Booking>;
  /** GET /bookings/{id}. 404 si no es del usuario. */
  getBooking(bookingId: string): Promise<Booking>;

  /* Postventa (F6). Todas con sesión. Las cuatro escrituras llevan Idempotency-Key (una por intento; ver shared/lib/attemptKeys). */

  /** GET /bookings (paginado por cursor): solo el resumen de cada reserva. 401 sin sesión. */
  listBookings(params?: ListBookingsParams): Promise<BookingPage>;
  /** GET /bookings/{id}/tickets. 404 si la reserva no es del usuario. */
  getTickets(bookingId: string): Promise<BookedTicket[]>;
  /** GET /bookings/{id}/tickets/{ticketId}. 404 si no existe o no es del usuario. */
  getTicket(bookingId: string, ticketId: string): Promise<BookedTicket>;
  /**
   * POST /bookings/{id}/check-in (todos los pasajeros). 404 si no es del usuario; 409 (CHECK_IN_NOT_AVAILABLE) o 422
   * si no corresponde (fuera de la ventana, reserva cancelada, sin boletos).
   */
  checkIn(bookingId: string, idempotencyKey: string): Promise<CheckInResult>;
  /** GET /bookings/{id}/boarding-passes. Antes del check-in no hay pases. */
  getBoardingPasses(bookingId: string): Promise<BoardingPass[]>;
  /** GET /bookings/{id}/baggage-options. */
  getBaggageOptions(bookingId: string): Promise<BaggageOption[]>;
  /**
   * POST /bookings/{id}/baggage. Hecho (200/201) o en proceso (202). Pago rechazado: 422 PAYMENT_NOT_AUTHORIZED;
   * límite superado o referencia reusada: 409.
   */
  addBaggage(bookingId: string, request: AddBaggageRequest, idempotencyKey: string): Promise<PostSaleOutcome<BaggageAdded>>;
  /** POST /bookings/{id}/date-change/search (solo lectura). 409 si la tarifa no permite cambios. */
  searchDateChange(bookingId: string, changes: DateChangeQuery[]): Promise<DateChangeOption[]>;
  /**
   * POST /bookings/{id}/date-change. Hecho (200: la reserva actualizada) o en proceso (202, CHANGE_PENDING).
   * 410 si la oferta de cambio venció; 422 pago rechazado.
   */
  confirmDateChange(bookingId: string, request: DateChangeRequest, idempotencyKey: string): Promise<PostSaleOutcome<Booking | null>>;
  /** GET /bookings/{id}/cancellation-quote. */
  getCancellationQuote(bookingId: string): Promise<CancellationQuote>;
  /** POST /bookings/{id}/cancel con la cotización. Hecha (200) o en proceso (202, CANCELLATION_PENDING). 409 si ya estaba cancelada. */
  cancelBooking(bookingId: string, request: CancelRequest, idempotencyKey: string): Promise<PostSaleOutcome<void>>;
}
