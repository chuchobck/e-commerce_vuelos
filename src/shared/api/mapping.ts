/**
 * Funciones puras entre el contrato y el dominio de la interfaz. Las usan por igual el mock y la
 * API real, así que las dos implementaciones entregan exactamente lo mismo a la interfaz.
 */
import { addMoney, multiplyMoney, parseMoney, zeroMoney, type Money } from '@/shared/lib/money';
import { airportOffsetMinutes } from './airports';
import type {
  CabinPricingDto,
  FlightOfferDto,
  FlightStatusDto,
  ItineraryDto,
  MoneyDto,
  PassengerBreakdownDto,
  PassengerTypeDto,
  SearchRequestDto,
  SearchResponseDto,
  SegmentDto,
  TokenResponseDto,
  UserResponseDto,
} from './contract';
import type {
  AuthTokens,
  Fare,
  FlightOffer,
  FlightStatus,
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
