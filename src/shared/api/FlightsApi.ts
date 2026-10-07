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
} from './types';

/**
 * Contrato único entre la interfaz y el proveedor de datos de vuelos.
 *
 * Dos implementaciones: `MockFlightsApi` (VITE_API_URL vacía) y `RealFlightsApi` (con valor).
 * Las operaciones públicas (search, getSeatMap, getFlightStatus) reciben y devuelven tipos que
 * derivan del contrato (./contract.ts → ./mapping.ts): las dos implementaciones producen la forma
 * del contrato y la mapean con las mismas funciones.
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

  /* Desde aquí: solo en el mock hasta F3 (sesión), F4 (hold y reserva) y F6 (postventa). */

  /** Bloquea temporalmente precio y cupo. 409 si la tarifa ya no está disponible. */
  createHold(request: CreateHoldRequest): Promise<Hold>;
  getHold(holdId: string): Promise<Hold>;
  cancelHold(holdId: string): Promise<void>;

  /** Convierte un hold en reserva pagada. 422 si los datos no son válidos, 409 si el hold expiró. */
  createBooking(request: CreateBookingRequest, token?: string): Promise<Booking>;
  /** Reservas del usuario autenticado. 401 sin sesión. */
  listBookings(token: string): Promise<Booking[]>;
  getBooking(bookingIdOrCode: string): Promise<Booking>;
  cancelBooking(bookingId: string, token?: string): Promise<Booking>;

  /** Check-in de todos los pasajeros. 401 sin sesión, 404 si la reserva no es del usuario, 409 fuera de la ventana. */
  checkIn(request: CheckInRequest, token?: string): Promise<CheckInResult>;
  getBoardingPasses(bookingId: string, token?: string): Promise<BoardingPass[]>;

  login(request: LoginRequest): Promise<AuthSession>;
  register(request: RegisterRequest): Promise<AuthSession>;
}
