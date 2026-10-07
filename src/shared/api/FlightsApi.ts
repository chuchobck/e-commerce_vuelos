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
} from './types';

/**
 * Contrato único entre la interfaz y el proveedor de datos de vuelos.
 *
 * Hoy lo implementa `MockFlightsApi` (src/shared/api/mock). Cuando exista la API real,
 * se creará otra clase que implemente esta misma interfaz usando `config.apiUrl`
 * (VITE_API_URL) y se registrará en src/shared/api/index.ts. La UI no cambia.
 *
 * Errores: toda implementación debe lanzar `ApiError` (src/shared/api/errors.ts).
 */
export interface FlightsApi {
  /** Catálogo de aeropuertos disponibles (para el buscador). */
  listAirports(): Promise<Airport[]>;

  /** Busca vuelos de ida (y vuelta si `returnDate` existe). */
  search(params: SearchParams): Promise<SearchResult>;

  /** Bloquea temporalmente precio y cupo. 409 si la tarifa ya no está disponible. */
  createHold(request: CreateHoldRequest): Promise<Hold>;
  getHold(holdId: string): Promise<Hold>;
  cancelHold(holdId: string): Promise<void>;

  /** Mapa de asientos de un vuelo. */
  getSeatMap(flightNumber: string, date: string): Promise<SeatMap>;

  /** Convierte un hold en reserva pagada. 422 si los datos no son válidos, 409 si el hold expiró. */
  createBooking(request: CreateBookingRequest, token?: string): Promise<Booking>;
  /** Reservas del usuario autenticado. 401 sin sesión. */
  listBookings(token: string): Promise<Booking[]>;
  getBooking(bookingIdOrCode: string): Promise<Booking>;
  cancelBooking(bookingId: string, token?: string): Promise<Booking>;

  checkIn(request: CheckInRequest): Promise<CheckInResult>;
  getBoardingPasses(bookingCode: string, lastName: string): Promise<BoardingPass[]>;

  getFlightStatus(flightNumber: string, date: string): Promise<FlightStatus>;

  login(request: LoginRequest): Promise<AuthSession>;
  register(request: RegisterRequest): Promise<AuthSession>;
}
