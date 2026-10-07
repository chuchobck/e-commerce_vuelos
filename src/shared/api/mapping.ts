/**
 * Funciones puras entre el contrato y el dominio de la interfaz. Las usan por igual el mock y la
 * API real, así que las dos implementaciones entregan exactamente lo mismo a la interfaz.
 */
import { addMoney, multiplyMoney, parseMoney, zeroMoney, type Money } from '@/shared/lib/money';
import { airportOffsetMinutes } from './airports';
import type {
  BookingDetailDto,
  BookingRequestDto,
  CabinPricingDto,
  FlightOfferDto,
  FlightStatusDto,
  HoldRequestDto,
  HoldResponseDto,
  HoldStatusDto,
  ItineraryDto,
  MoneyDto,
  PassengerBreakdownDto,
  PassengerItemDto,
  PassengerTypeDto,
  SearchRequestDto,
  SearchResponseDto,
  SegmentDto,
  TicketDto,
  TokenResponseDto,
  UserResponseDto,
} from './contract';
import type {
  AuthTokens,
  BookedFare,
  BookedLeg,
  BookedPassenger,
  Booking,
  BookingPassenger,
  CreateBookingRequest,
  CreateHoldRequest,
  Fare,
  FlightOffer,
  FlightStatus,
  Hold,
  Itinerary,
  PassengerCount,
  SearchParams,
  SearchResult,
  Segment,
  User,
} from './types';

/** "2026-10-09T11:00:00.000Z" en un aeropuerto UTC−5 → "2026-10-09T06:00:00-05:00". */
export function toAirportLocalIso(utcIso: string, airport: string): string {
  const offset = airportOffsetMinutes(airport);
  const local = new Date(new Date(utcIso).getTime() + offset * 60_000);
  const sign = offset <= 0 ? '-' : '+';
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${local.toISOString().slice(0, 19)}${sign}${hh}:${mm}`;
}

function mapMoney(dto: MoneyDto): Money {
  return parseMoney(dto.total, dto.currency);
}

function toPassengerBreakdown(p: PassengerCount): Required<PassengerBreakdownDto> {
  return { adults: p.adults, youths: 0, children: p.children, infants: p.infants };
}

export function toSearchRequest(params: SearchParams): SearchRequestDto {
  const itineraries: SearchRequestDto['itineraries'] = [
    { origin: params.origin, destination: params.destination, departureDate: params.departDate },
  ];
  // Ida y vuelta: una sola búsqueda con dos tramos; cada oferta trae un itinerario por tramo.
  if (params.returnDate) {
    itineraries.push({ origin: params.destination, destination: params.origin, departureDate: params.returnDate });
  }
  return { itineraries, passengers: toPassengerBreakdown(params.passengers) };
}

const COUNT_BY_TYPE: Record<PassengerTypeDto, (p: PassengerCount) => number> = {
  ADULT: (p) => p.adults,
  YOUTH: () => 0,
  CHILD: (p) => p.children,
  INFANT: (p) => p.infants,
};

/**
 * Familia tarifaria del contrato → `Fare`. El total multiplica el precio de cada tipo de pasajero
 * por cuántos viajan. Si falta el precio de un tipo que viaja, la familia no se puede ofrecer: `null`.
 */
export function mapFare(dto: CabinPricingDto, passengers: PassengerCount): Fare | null {
  const priceOf = (type: PassengerTypeDto) => dto.pricePerPassengerType.find((p) => p.passengerType === type)?.price;
  const adult = priceOf('ADULT');
  if (!adult) return null;
  let total: Money = zeroMoney(adult.currency);
  for (const type of Object.keys(COUNT_BY_TYPE) as PassengerTypeDto[]) {
    const count = COUNT_BY_TYPE[type](passengers);
    if (count === 0) continue;
    const price = priceOf(type);
    if (!price) return null;
    total = addMoney(total, multiplyMoney(mapMoney(price), count));
  }
  return {
    cabin: dto.cabinClass,
    brand: dto.fareBrand,
    seatsLeft: dto.availableSeats,
    refundable: dto.fareRules.isRefundable,
    changeable: dto.fareRules.isChangeable,
    baggage: {
      personalItem: dto.baggageAllowance.personalItemIncluded ?? false,
      carryOn: dto.baggageAllowance.carryOnIncluded ?? 0,
      checked: dto.baggageAllowance.checkedBaggageIncluded ?? 0,
    },
    extraBagPrice: dto.extraCheckedBaggagePrice ? mapMoney(dto.extraCheckedBaggagePrice) : null,
    pricePerAdult: mapMoney(adult),
    total,
  };
}

function mapSegment(dto: SegmentDto): Segment {
  return {
    id: dto.segmentId,
    flightNumber: dto.flightNumber,
    carrier: dto.marketingCarrier,
    origin: dto.departure.iataCode,
    destination: dto.arrival.iataCode,
    departureTime: toAirportLocalIso(dto.departure.at, dto.departure.iataCode),
    arrivalTime: toAirportLocalIso(dto.arrival.at, dto.arrival.iataCode),
    durationMinutes: dto.durationMinutes ?? null,
    aircraft: dto.aircraft ?? null,
    layoverMinutes: dto.layoverMinutes ?? null,
  };
}

function mapItinerary(dto: ItineraryDto, passengers: PassengerCount): Itinerary {
  return {
    id: dto.itineraryId,
    segments: dto.segments.map(mapSegment),
    durationMinutes: dto.totalDurationMinutes,
    stops: dto.stopsCount,
    fares: dto.pricingOptions.map((p) => mapFare(p, passengers)).filter((f): f is Fare => f !== null),
  };
}

export function mapOffer(dto: FlightOfferDto, passengers: PassengerCount): FlightOffer {
  return {
    id: dto.offerId,
    airline: { code: dto.airline.code ?? '', name: dto.airline.name ?? dto.airline.code ?? '' },
    itineraries: dto.itineraries.map((it) => mapItinerary(it, passengers)),
    grandTotal: mapMoney(dto.grandTotal),
  };
}

export function mapSearchResponse(dto: SearchResponseDto, params: SearchParams): SearchResult {
  return { params, offers: dto.offers.map((o) => mapOffer(o, params.passengers)) };
}

export function mapFlightStatus(dto: FlightStatusDto): FlightStatus {
  const point = (p: FlightStatusDto['departure']) => ({
    airport: p.iataCode,
    terminal: p.terminal ?? null,
    scheduled: toAirportLocalIso(p.scheduledAt, p.iataCode),
    estimated: p.estimatedAt ? toAirportLocalIso(p.estimatedAt, p.iataCode) : null,
    actual: p.actualAt ? toAirportLocalIso(p.actualAt, p.iataCode) : null,
  });
  return {
    flightNumber: dto.flightNumber,
    date: dto.date,
    carrier: dto.marketingCarrier,
    status: dto.status,
    departure: point(dto.departure),
    arrival: point(dto.arrival),
    aircraft: dto.aircraft ?? null,
  };
}

/** Las familias de un itinerario que pertenecen a la cabina pedida, de la más barata a la más cara. */
export function faresForCabin(itinerary: Itinerary, cabin: SearchParams['cabin']): Fare[] {
  return itinerary.fares.filter((f) => f.cabin === cabin).sort((a, b) => a.total.cents - b.total.cents);
}

/** Firma de un itinerario: mismos vuelos a la misma hora (sirve para agrupar ofertas de ida y vuelta). */
export function itinerarySignature(itinerary: Itinerary): string {
  return itinerary.segments.map((s) => `${s.flightNumber}@${s.departureTime}`).join('+');
}

export function mapTokens(dto: TokenResponseDto): AuthTokens {
  return { accessToken: dto.access_token, refreshToken: dto.refresh_token, expiresIn: dto.expires_in, scope: dto.scope };
}

export function mapUser(dto: UserResponseDto): User {
  return { id: dto.id, email: dto.email, roles: dto.roles, scopes: dto.scopes, createdAt: dto.createdAt };
}

/* ------------------------------------- Hold y reserva (F4a) ------------------------------------- */

export function toHoldRequest(request: CreateHoldRequest): HoldRequestDto {
  return {
    offerId: request.offerId,
    itinerarySelections: request.itinerarySelections.map(({ itineraryId, cabinClass, fareBrand }) => ({ itineraryId, cabinClass, fareBrand })),
    passengersBreakdown: toPassengerBreakdown(request.passengers),
  };
}

/** POST /offers/hold. Recién creado, le quedan exactamente `ttlMinutes` (la respuesta no trae remainingSeconds). */
export function mapHoldCreated(dto: HoldResponseDto, receivedAt: number): Hold {
  return {
    id: dto.holdId,
    status: dto.status,
    expiresAt: dto.expiresAt,
    remainingSeconds: dto.ttlMinutes * 60,
    receivedAt,
    lockedPrice: mapMoney(dto.lockedPrice),
  };
}

/** GET /offers/hold/{id}: la respuesta no repite el id. */
export function mapHoldStatus(dto: HoldStatusDto, holdId: string, receivedAt: number): Hold {
  return {
    id: holdId,
    status: dto.status,
    expiresAt: dto.expiresAt ?? null,
    remainingSeconds: Math.max(0, dto.remainingSeconds),
    receivedAt,
    lockedPrice: mapMoney(dto.lockedPrice),
  };
}

function toPassengerItem(p: BookingPassenger): PassengerItemDto {
  return {
    passengerId: p.id,
    passengerType: p.type,
    ...(p.associatedAdultId ? { associatedAdultId: p.associatedAdultId } : {}),
    firstName: p.firstName,
    lastName: p.lastName,
    documentType: p.documentType,
    documentNumber: p.documentNumber,
    nationality: p.nationality,
    ...(p.documentExpiryDate ? { documentExpiryDate: p.documentExpiryDate } : {}),
    birthDate: p.birthDate,
    gender: p.gender,
    contact: { email: p.email, phone: p.phone },
    ...(p.seats?.length ? { assignedSeats: p.seats } : {}),
  };
}

export function toBookingRequest(request: CreateBookingRequest): BookingRequestDto {
  return {
    holdId: request.holdId,
    passengers: request.passengers.map(toPassengerItem),
    payment: { paymentReference: request.paymentReference },
  };
}

function mapBookedFare(dto: CabinPricingDto): BookedFare {
  return {
    cabin: dto.cabinClass,
    brand: dto.fareBrand,
    refundable: dto.fareRules.isRefundable,
    changeable: dto.fareRules.isChangeable,
    baggage: {
      personalItem: dto.baggageAllowance.personalItemIncluded ?? false,
      carryOn: dto.baggageAllowance.carryOnIncluded ?? 0,
      checked: dto.baggageAllowance.checkedBaggageIncluded ?? 0,
    },
    extraBagPrice: dto.extraCheckedBaggagePrice ? mapMoney(dto.extraCheckedBaggagePrice) : null,
  };
}

/** Itinerario de una reserva: trae solo la familia vendida, sin precios por tipo (README, sección 6). */
function mapBookedLeg(dto: ItineraryDto): BookedLeg {
  const fare = dto.pricingOptions[0];
  if (!fare) throw new Error(`El itinerario ${dto.itineraryId} de la reserva no trae su familia`);
  return {
    itinerary: { id: dto.itineraryId, segments: dto.segments.map(mapSegment), durationMinutes: dto.totalDurationMinutes, stops: dto.stopsCount },
    fare: mapBookedFare(fare),
  };
}

function mapBookedPassenger(dto: PassengerItemDto): BookedPassenger {
  return {
    id: dto.passengerId,
    type: dto.passengerType,
    ...(dto.associatedAdultId ? { associatedAdultId: dto.associatedAdultId } : {}),
    firstName: dto.firstName,
    lastName: dto.lastName,
    documentType: dto.documentType,
    documentNumber: dto.documentNumber,
    nationality: dto.nationality,
    ...(dto.documentExpiryDate ? { documentExpiryDate: dto.documentExpiryDate } : {}),
    birthDate: dto.birthDate,
    gender: dto.gender,
    email: dto.contact.email,
    phone: dto.contact.phone,
    seats: dto.assignedSeats ?? [],
  };
}

function mapTicket(dto: TicketDto): Booking['tickets'][number] {
  return { id: dto.ticketId, passengerId: dto.passengerId, number: dto.eTicketNumber ?? null, status: dto.status, issuedAt: dto.issuedAt ?? null };
}

export function mapBooking(dto: BookingDetailDto): Booking {
  const [outbound, inbound] = (dto.itineraries ?? []).map(mapBookedLeg);
  if (!outbound) throw new Error(`La reserva ${dto.bookingId} no trae itinerarios`);
  return {
    id: dto.bookingId,
    code: dto.pnr,
    status: dto.status,
    createdAt: dto.createdAt,
    outbound,
    ...(inbound ? { inbound } : {}),
    passengers: (dto.passengers ?? []).map(mapBookedPassenger),
    tickets: (dto.tickets ?? []).map(mapTicket),
    total: mapMoney(dto.grandTotal),
    changes: (dto.changes ?? []).map((c) => ({ at: c.changedAt ?? '', description: c.description ?? '' })),
  };
}
