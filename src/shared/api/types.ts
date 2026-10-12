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
 * Hold y reserva derivan del contrato (F4a); la postventa (F6) también: lista, boletos, check-in, pases, equipaje,
 * cambio de fecha y cancelación.
 */
import type { Money } from '@/shared/lib/money';
import type {
  BoardingPassDto,
  BookingDetailDto,
  CabinClass,
  CheckInResponseDto,
  FlightStatusCode,
  HoldStatusDto,
  PassengerItemDto,
  SeatMapDto,
  TicketDto,
} from './contract';

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

/** Opciones de una búsqueda que no cambian lo que se pide: poder cancelarla y decidir si se reintenta sola. */
export interface SearchOptions {
  signal?: AbortSignal;
  /**
   * Por defecto la lectura se reintenta una vez ante red, tiempo agotado o 503 (ver el cliente HTTP).
   * `false` la envía una sola vez: para quien lleva la cuenta de las peticiones (las ofertas del inicio).
   */
  retry?: boolean;
  /**
   * Búsqueda que nadie espera en pantalla (decoración, como las ofertas del inicio): el mock no le inyecta errores aleatorios,
   * para que esas secciones se vean completas; los casos de error se piden con `?escenario=` (ver mock/scenarios.ts). La API
   * real la trata como cualquier otra.
   */
  background?: boolean;
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
/* Hold y reserva (F4a): derivan del contrato (HoldResponse, HoldStatusResponse, BookingDetail).  */
/* -------------------------------------------------------------------------------------------- */

/** Como HoldRequest del contrato, con los pasajeros del buscador. */
export interface CreateHoldRequest {
  offerId: string;
  itinerarySelections: { itineraryId: string; cabinClass: CabinClass; fareBrand: string }[];
  passengers: PassengerCount;
}

export type HoldStatus = HoldStatusDto['status'];

/**
 * Hold del contrato. El tiempo restante sale del SERVIDOR (`remainingSeconds`) y se mide desde
 * `receivedAt`, el momento en que llegó la respuesta según el reloj de este equipo: así un reloj
 * desfasado no adelanta ni atrasa el vencimiento (ver features/checkout/holdClock.ts).
 */
export interface Hold {
  id: string;
  status: HoldStatus;
  /** Hora de vencimiento según el servidor (UTC). Solo informativa: no se compara con el reloj local. */
  expiresAt: string | null;
  remainingSeconds: number;
  /** Date.now() local al recibir la respuesta. */
  receivedAt: number;
  lockedPrice: Money;
  /** Tarifa base e impuestos del precio congelado, si la API los da. */
  fareBreakdown?: { base: Money; taxes: Money };
}

export type PassengerTypeCode = PassengerItemDto['passengerType'];
export type DocumentType = PassengerItemDto['documentType'];
export type Gender = PassengerItemDto['gender'];

/** Pasajero de la reserva (PassengerItem del contrato, sin equipaje: se compra después). */
export interface BookingPassenger {
  /** Lo elige el cliente (PAX1, PAX2…); único dentro de la reserva. */
  id: string;
  type: PassengerTypeCode;
  /** Solo infantes: el id del adulto que lo lleva. */
  associatedAdultId?: string;
  firstName: string;
  lastName: string;
  documentType: DocumentType;
  documentNumber: string;
  /** País ISO 3166-1 alfa-2. */
  nationality: string;
  /** yyyy-MM-dd; obligatoria con pasaporte. */
  documentExpiryDate?: string;
  /** yyyy-MM-dd. */
  birthDate: string;
  gender: Gender;
  email: string;
  phone: string;
  /** Asientos elegidos; sin ellos la API asigna el primero libre de la cabina. */
  seats?: { segmentId: string; seatNumber: string }[];
}

/** BookingRequest del contrato: el dueño sale del token, nunca del cuerpo. */
export interface CreateBookingRequest {
  holdId: string;
  passengers: BookingPassenger[];
  /** Referencia de la Payment API (shared/payments). Nunca datos de tarjeta. */
  paymentReference: string;
}

export type BookingStatus = BookingDetailDto['status'];
export type TicketStatus = TicketDto['status'];
export type TicketSegmentStatus = NonNullable<TicketDto['segments']>[number]['status'];

/** Familia vendida: la API la devuelve sin precios por tipo (README, sección 6). */
export type BookedFare = Omit<Fare, 'seatsLeft' | 'pricePerAdult' | 'total'>;

/** Lo reservado en un tramo: el itinerario y la familia vendida. */
export interface BookedLeg {
  itinerary: Omit<Itinerary, 'fares'>;
  fare: BookedFare;
}

export interface BookedPassenger extends Omit<BookingPassenger, 'seats'> {
  seats: { segmentId: string; seatNumber: string }[];
  /** Maletas extra ya compradas, por itinerario (PassengerItem.extraBaggage). */
  extraBaggage: { itineraryId: string; quantity: number }[];
}

export interface BookedTicket {
  id: string;
  passengerId: string;
  /** Número de boleto electrónico (cuando ya se emitió). */
  number: string | null;
  status: TicketStatus;
  issuedAt: string | null;
  /** Estado de cada tramo del boleto (cupón). */
  segments: { segmentId: string; status: TicketSegmentStatus; coupon: string | null }[];
  /** Por qué falló la emisión (nunca se muestra tal cual: es un texto técnico). */
  failureReason: string | null;
}

/** Reserva (BookingDetail del contrato). */
export interface Booking {
  id: string;
  /** PNR. */
  code: string;
  status: BookingStatus;
  createdAt: string;
  outbound: BookedLeg;
  inbound?: BookedLeg;
  passengers: BookedPassenger[];
  tickets: BookedTicket[];
  total: Money;
  changes: { at: string; description: string }[];
}

/* -------------------------------------------------------------------------------------------- */
/* Postventa (F6): derivan del contrato (BookingListResponse, Ticket, CheckInResponse, …).        */
/* -------------------------------------------------------------------------------------------- */

/** Resultado de una escritura de postventa: hecha (200/201) o aceptada y en proceso (202). */
export type PostSaleOutcome<T> = { status: 'done'; data: T } | { status: 'pending' };

/** Una reserva en la lista (BookingListResponse.items): solo el resumen que da la API. */
export interface BookingSummary {
  id: string;
  code: string;
  /** `null` si la API manda un estado que este frontend no conoce (el contrato lo deja como texto libre). */
  status: BookingStatus | null;
  origin: IataCode;
  destination: IataCode;
  /** yyyy-MM-dd (fecha local del aeropuerto de salida). */
  departureDate: string;
  total: Money;
}

export interface BookingPage {
  items: BookingSummary[];
  /** Cursor de la página siguiente; `null` si no hay más. */
  nextCursor: string | null;
}

export interface ListBookingsParams {
  cursor?: string;
  limit?: number;
}

export type CheckInStatus = CheckInResponseDto['status'];
export type CheckInItemStatus = CheckInResponseDto['checkedInPassengers'][number]['status'];

/** Respuesta de POST /bookings/{id}/check-in. */
export interface CheckInResult {
  bookingId: string;
  status: CheckInStatus;
  passengers: {
    passengerId: string;
    status: CheckInItemStatus;
    segments: { segmentId: string; seat: string | null; status: CheckInItemStatus }[];
  }[];
}

export type BarcodeType = BoardingPassDto['barcodeType'];

/** Pase de abordar tal como lo da la API: no trae puerta ni hora de embarque. */
export interface BoardingPass {
  passengerId: string;
  segmentId: string;
  seat: string;
  boardingGroup: string | null;
  boardingPosition: string | null;
  /** Texto del código tal cual; el formato lo decide la API. */
  barcode: string;
  barcodeType: BarcodeType;
}

export interface BaggageOption {
  passengerId: string;
  itineraryId: string;
  /** Precio de cada maleta extra; `null` si la API no lo da. */
  price: Money | null;
  /** Máximo de maletas extra que se pueden tener en total. */
  maxAllowed: number;
  alreadyPurchased: number;
}

export interface AddBaggageRequest {
  passengerId: string;
  itineraryId: string;
  quantity: number;
  /** Referencia de la Payment API (simulada por prefijo). Nunca datos de tarjeta. */
  paymentReference: string;
}

export interface BaggageAdded {
  passengerId: string;
  itineraryId: string;
  /** Maletas extra que tiene ahora el pasajero en ese itinerario. */
  totalBaggage: number | null;
}

export interface DateChangeQuery {
  itineraryId: string;
  /** yyyy-MM-dd. */
  newDepartureDate: string;
}

/** Diferencia de precio de un cambio de fecha: positivo se paga, negativo se reembolsa. */
export interface DateChangePrice {
  fare: Money;
  taxes: Money;
  fee: Money;
  total: Money;
}

export interface DateChangeOption {
  /** changeOfferId: lo pide la confirmación. */
  id: string;
  expiresAt: string;
  segments: Segment[];
  price: DateChangePrice;
}

export interface DateChangeRequest {
  changeOfferId: string;
  /** Solo si hay algo que pagar. */
  paymentReference?: string;
  seats?: { segmentId: string; seatNumber: string }[];
}

export interface CancellationQuote {
  quoteId: string;
  refundable: boolean;
  refund: Money;
  penalty: Money;
  expiresAt: string;
}

export interface CancelRequest {
  quoteId: string;
  reason?: string;
}

/**
 * Usuario de GET /auth/me. La API no guarda nombre, documento ni teléfono: la cuenta es solo
 * correo y contraseña; los datos de quien viaja se piden por pasajero en la compra (F4).
 */
export interface User {
  id: string;
  email: string;
  /** Los decide el backend (p. ej. "cliente"); el frontend nunca envía un rol. */
  roles: string[];
  scopes: string[];
  createdAt: string;
}

export interface Credentials {
  email: string;
  password: string;
}

/** Respuesta de /auth/login y /auth/refresh. */
export interface AuthTokens {
  /** JWT de 15 minutos: solo en memoria. */
  accessToken: string;
  /** Token opaco de 7 días; se rota en cada uso. */
  refreshToken: string;
  /** Segundos de vida del token de acceso. */
  expiresIn: number;
  scope: string;
}
