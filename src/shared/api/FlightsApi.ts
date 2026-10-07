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

  /* Desde aquí: solo en el mock hasta F4 (hold y reserva) y F6 (postventa). */

  /** Bloquea temporalmente precio y cupo. 409 si la tarifa ya no está disponible. */
  createHold(request: CreateHoldRequest): Promise<Hold>;
  getHold(holdId: string): Promise<Hold>;
  cancelHold(holdId: string): Promise<void>;

  /** Convierte un hold en reserva pagada. 422 si los datos no son válidos, 409 si el hold expiró. */
  createBooking(request: CreateBookingRequest): Promise<Booking>;
  /** Reservas del usuario autenticado. 401 sin sesión. */
  listBookings(): Promise<Booking[]>;
  getBooking(bookingIdOrCode: string): Promise<Booking>;
  cancelBooking(bookingId: string): Promise<Booking>;

  /** Check-in de todos los pasajeros. 401 sin sesión, 404 si la reserva no es del usuario, 409 fuera de la ventana. */
  checkIn(request: CheckInRequest): Promise<CheckInResult>;
  getBoardingPasses(bookingId: string): Promise<BoardingPass[]>;

}
