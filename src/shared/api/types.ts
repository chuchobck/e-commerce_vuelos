/**
 * Tipos del dominio que usa la interfaz. Lo público (búsqueda, mapa de asientos, estado de vuelo)
 * DERIVA del contrato (./contract.ts) y se llena con las funciones puras de ./mapping.ts.
 *
 * Diferencias deliberadas con el contrato, todas resueltas en el mapeo:
 *  - Dinero: el contrato lo entrega como texto ("94.38"); aquí es `Money` (centavos enteros).
 *  - Horas: la API responde en UTC ("…Z"); aquí van con el desfase del aeropuerto
 *    ("2026-10-09T06:00:00-05:00") para mostrar la hora local sin cálculos en los componentes.
 *  - Fechas sin hora: "yyyy-MM-dd" (fecha local del aeropuerto de salida).
 *
 * Hold, reserva, check-in y sesión siguen siendo del mock: se conectan en F3, F4 y F6.
 */
import type { Money } from '@/shared/lib/money';
import type { CabinClass, FlightStatusCode, SeatMapDto } from './contract';

export type { CabinClass, FlightStatusCode } from './contract';
export type { Money } from '@/shared/lib/money';

export type IataCode = string;

/** Cabinas que se ofrecen en el buscador (la flota de la semilla solo tiene estas dos). */
export type SearchCabin = Extract<CabinClass, 'ECONOMY' | 'BUSINESS'>;

/** Pasajeros del buscador. "youths" del contrato no se pide en la interfaz (se envía 0). */
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
  /** La API no filtra por cabina: devuelve todas y la interfaz muestra solo esta. */
  cabin: SearchCabin;
}

export interface Segment {
  /** segmentId del contrato (sirve para pedir el mapa de asientos). */
  id: string;
  flightNumber: string;
  /** Aerolínea comercial (IATA). */
  carrier: string;
  origin: IataCode;
  destination: IataCode;
  /** Hora local del aeropuerto de salida, ISO con desfase. */
  departureTime: string;
  /** Hora local del aeropuerto de llegada, ISO con desfase. */
  arrivalTime: string;
  durationMinutes: number | null;
  aircraft: string | null;
  /** Espera antes de este tramo (solo en conexiones). */
  layoverMinutes: number | null;
}

/** Una familia tarifaria de un itinerario (CabinPricing del contrato). */
export interface Fare {
  cabin: CabinClass;
  /** Código de la familia tal como lo da la API (BASIC, CLASSIC, FLEX, BUSINESS_FLEX…). */
  brand: string;
  seatsLeft: number;
  refundable: boolean;
  changeable: boolean;
  baggage: { personalItem: boolean; carryOn: number; checked: number };
  extraBagPrice: Money | null;
  /** Precio de un adulto en este itinerario. */
  pricePerAdult: Money;
  /** Precio de todos los pasajeros de la búsqueda en este itinerario. */
  total: Money;
}

export interface Itinerary {
  id: string;
  segments: Segment[];
  durationMinutes: number;
  stops: number;
  fares: Fare[];
}

/** Oferta: una aerolínea y un itinerario por tramo (uno en solo ida, dos en ida y vuelta). */
export interface FlightOffer {
  id: string;
  airline: { code: string; name: string };
  itineraries: Itinerary[];
  /** Total de la combinación más barata, para todos los pasajeros. */
  grandTotal: Money;
}

export interface SearchResult {
  params: SearchParams;
  offers: FlightOffer[];
}

/** Lo elegido en un tramo: el itinerario y su familia tarifaria. */
export interface SelectedLeg {
  itinerary: Itinerary;
  fare: Fare;
}

/** Mapa de asientos: la forma del contrato tal cual (la pantalla llega en F5). */
export type SeatMap = SeatMapDto;

export interface FlightStatusPoint {
  airport: IataCode;
  terminal: string | null;
  /** Horas locales del aeropuerto, ISO con desfase. */
  scheduled: string;
  estimated: string | null;
  actual: string | null;
}

export interface FlightStatus {
  flightNumber: string;
  date: string;
  carrier: string;
  status: FlightStatusCode;
  departure: FlightStatusPoint;
  arrival: FlightStatusPoint;
  aircraft: string | null;
}

/* -------------------------------------------------------------------------------------------- */
/* Hold, reserva, check-in y sesión: formas del mock hasta F3, F4 y F6.                          */
/* -------------------------------------------------------------------------------------------- */

/** Como HoldRequest del contrato, con los pasajeros del buscador. */
export interface CreateHoldRequest {
  offerId: string;
  itinerarySelections: { itineraryId: string; cabinClass: CabinClass; fareBrand: string }[];
  passengers: PassengerCount;
}

export type HoldStatus = 'ACTIVE' | 'EXPIRED' | 'CANCELLED' | 'CONVERTED';

export interface Hold {
  id: string;
  status: HoldStatus;
  createdAt: string;
  expiresAt: string;
  offerId: string;
  outbound: SelectedLeg;
  inbound?: SelectedLeg;
  passengers: PassengerCount;
  totalPrice: Money;
}

export type PassengerType = 'ADT' | 'CHD' | 'INF';
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
  outbound: SelectedLeg;
  inbound?: SelectedLeg;
  passengers: BookedPassenger[];
  contact: ContactData;
  totalPaid: Money;
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
