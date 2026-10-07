/**
 * Tipos del dominio compartidos entre la UI y cualquier implementación de FlightsApi.
 * Fechas: "yyyy-MM-dd" (ISO local). Fechas con hora: ISO 8601 con zona (-05:00, -06:00 en Galápagos).
 * Montos: USD con 2 decimales.
 */

export type IataCode = string;

export interface Airport {
  code: IataCode;
  city: string;
  name: string;
  province: string;
  /** Zona horaria IANA. Galápagos está en UTC-6. */
  timeZone: 'America/Guayaquil' | 'Pacific/Galapagos';
  lat: number;
  lon: number;
}

export type Cabin = 'ECONOMY' | 'BUSINESS';
export type PassengerType = 'ADT' | 'CHD' | 'INF';
export type FareFamily = 'LIGHT' | 'CLASSIC' | 'FLEX';

export interface PassengerCount {
  adults: number;
  children: number;
  infants: number;
}

export interface SearchParams {
  origin: IataCode;
  destination: IataCode;
  departDate: string;
  returnDate?: string;
  passengers: PassengerCount;
  cabin: Cabin;
}

export interface BaggageAllowance {
  personalItem: boolean;
  carryOnKg: number;
  checkedBags: number;
  checkedBagKg: number;
}

export interface Fare {
  id: string;
  family: FareFamily;
  cabin: Cabin;
  /** Precio por adulto, con impuestos. */
  pricePerAdult: number;
  /** Precio total para todos los pasajeros de la búsqueda. */
  totalPrice: number;
  currency: 'USD';
  baggage: BaggageAllowance;
  changeable: boolean;
  changeFee: number | null;
  refundable: boolean;
  seatSelectionIncluded: boolean;
  seatsLeft: number;
}

export interface FlightSegment {
  flightNumber: string;
  origin: IataCode;
  destination: IataCode;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  aircraft: string;
}

export interface FlightOffer {
  id: string;
  segments: FlightSegment[];
  durationMinutes: number;
  stops: number;
  fares: Fare[];
}

export interface SearchResult {
  searchId: string;
  params: SearchParams;
  outbound: FlightOffer[];
  inbound: FlightOffer[];
}

export interface CreateHoldRequest {
  outbound: { offerId: string; fareId: string };
  inbound?: { offerId: string; fareId: string };
  passengers: PassengerCount;
}

export type HoldStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'CONVERTED';

export interface Hold {
  id: string;
  status: HoldStatus;
  createdAt: string;
  expiresAt: string;
  outbound: { offer: FlightOffer; fare: Fare };
  inbound?: { offer: FlightOffer; fare: Fare };
  passengers: PassengerCount;
  totalPrice: number;
  currency: 'USD';
}

export type SeatStatus = 'AVAILABLE' | 'OCCUPIED' | 'BLOCKED';
export type SeatKind = 'STANDARD' | 'EXTRA_LEGROOM' | 'EXIT_ROW';

export interface Seat {
  id: string;
  row: number;
  letter: string;
  status: SeatStatus;
  kind: SeatKind;
  price: number;
  window: boolean;
  aisle: boolean;
}

export interface SeatMap {
  flightNumber: string;
  aircraft: string;
  columns: string[];
  /** Índices de columna tras los cuales hay pasillo. */
  aisleAfter: number[];
  rows: { number: number; seats: Seat[] }[];
}

export type DocumentType = 'CEDULA' | 'PASSPORT';

export interface PassengerData {
  type: PassengerType;
  firstName: string;
  lastName: string;
  birthDate: string;
  documentType: DocumentType;
  documentNumber: string;
  /** Asiento elegido; si falta se asigna automáticamente. */
  seatId?: string;
}

export interface ContactData {
  email: string;
  phone: string;
}

export interface PaymentData {
  cardNumber: string;
  cardHolder: string;
  expiry: string;
  cvv: string;
}

export interface CreateBookingRequest {
  holdId: string;
  passengers: PassengerData[];
  contact: ContactData;
  payment: PaymentData;
}

export type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'CHECKED_IN';

export interface BookedPassenger extends Omit<PassengerData, 'seatId'> {
  id: string;
  seat: string | null;
  seatAutoAssigned: boolean;
}

export interface Booking {
  id: string;
  code: string;
  status: BookingStatus;
  createdAt: string;
  outbound: { offer: FlightOffer; fare: Fare };
  inbound?: { offer: FlightOffer; fare: Fare };
  passengers: BookedPassenger[];
  contact: ContactData;
  totalPaid: number;
  currency: 'USD';
  userId?: string;
}

/** El check-in se hace por bookingId y solo lo puede hacer el dueño de la reserva (con sesión). */
export interface CheckInRequest {
  bookingId: string;
}

export interface BoardingPass {
  id: string;
  bookingCode: string;
  passengerName: string;
  flightNumber: string;
  origin: IataCode;
  destination: IataCode;
  departureTime: string;
  boardingTime: string;
  gate: string;
  seat: string;
  group: string;
  barcode: string;
}

export interface CheckInResult {
  booking: Booking;
  boardingPasses: BoardingPass[];
}

export type FlightStatusCode = 'SCHEDULED' | 'ON_TIME' | 'DELAYED' | 'BOARDING' | 'DEPARTED' | 'LANDED' | 'CANCELLED';

export interface FlightStatus {
  flightNumber: string;
  date: string;
  origin: IataCode;
  destination: IataCode;
  status: FlightStatusCode;
  scheduledDeparture: string;
  estimatedDeparture: string;
  scheduledArrival: string;
  estimatedArrival: string;
  gate: string | null;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  documentType: DocumentType;
  documentNumber: string;
  phone: string;
  birthDate?: string;
}

export interface AuthSession {
  token: string;
  user: User;
  expiresAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  documentType: DocumentType;
  documentNumber: string;
  phone: string;
}
