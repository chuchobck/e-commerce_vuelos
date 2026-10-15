/**
 * Una función pura por operación: respuesta GraphQL → la MISMA forma (DTO del contrato) que da REST.
 * Los `null` de GraphQL pasan a campo ausente donde el contrato REST lo omite; donde el contrato
 * admite `null` (aircraft, durationMinutes, terminal, estimatedAt, actualAt) se conserva. Después
 * se reutilizan `mapSearchResponse` y `mapFlightStatus` de ../mapping: ninguna regla de negocio
 * (dinero en centavos, horas locales, familias tarifarias) se repite aquí.
 */
import type { FlightStatusDto, MoneyDto, SearchResponseDto, SeatMapDto } from '../contract';
import type { FlightStatusData, GqlCabinPricing, GqlItinerary, GqlMoney, GqlOffer, GqlSegment, SearchFlightsData, SeatMapData } from './types';

function money({ currency, total }: GqlMoney): MoneyDto {
  return { currency, total };
}

function mapSegmentData(s: GqlSegment): SearchResponseDto['offers'][number]['itineraries'][number]['segments'][number] {
  return {
    segmentId: s.segmentId,
    flightNumber: s.flightNumber,
    departure: { iataCode: s.departure.iataCode, at: s.departure.at },
    arrival: { iataCode: s.arrival.iataCode, at: s.arrival.at },
    ...(s.layoverMinutes !== null ? { layoverMinutes: s.layoverMinutes } : {}),
    marketingCarrier: s.marketingCarrier,
    operatingCarrier: s.operatingCarrier,
    aircraft: s.aircraft,
    durationMinutes: s.durationMinutes,
  };
}

function mapPricingData(p: GqlCabinPricing): SearchResponseDto['offers'][number]['itineraries'][number]['pricingOptions'][number] {
  return {
    cabinClass: p.cabinClass,
    fareBrand: p.fareBrand,
    availableSeats: p.availableSeats,
    fareRules: { isRefundable: p.fareRules.isRefundable, isChangeable: p.fareRules.isChangeable },
    baggageAllowance: {
      personalItemIncluded: p.baggageAllowance.personalItemIncluded,
      carryOnIncluded: p.baggageAllowance.carryOnIncluded,
      checkedBaggageIncluded: p.baggageAllowance.checkedBaggageIncluded,
    },
    ...(p.extraCheckedBaggagePrice ? { extraCheckedBaggagePrice: money(p.extraCheckedBaggagePrice) } : {}),
    pricePerPassengerType: p.pricePerPassengerType.map(({ passengerType, price }) => ({ passengerType, price: money(price) })),
  };
}

function mapItineraryData(it: GqlItinerary) {
  return {
    itineraryId: it.itineraryId,
    totalDurationMinutes: it.totalDurationMinutes,
    stopsCount: it.stopsCount,
    segments: it.segments.map(mapSegmentData),
    pricingOptions: it.pricingOptions.map(mapPricingData),
  };
}

function mapOfferData(o: GqlOffer): SearchResponseDto['offers'][number] {
  return {
    offerId: o.offerId,
    airline: { code: o.airline.code, name: o.airline.name },
    itineraries: o.itineraries.map(mapItineraryData),
    grandTotal: money(o.grandTotal),
  };
}

/** searchFlights → SearchResponse (POST /search). */
export function mapSearchData(data: SearchFlightsData): SearchResponseDto {
  return { totalOffers: data.searchFlights.totalOffers, offers: data.searchFlights.offers.map(mapOfferData) };
}

/** seatMap → SeatMapResponse (GET /offers/{id}/seatmap). */
export function mapSeatMapData({ seatMap }: SeatMapData): SeatMapDto {
  return {
    segmentId: seatMap.segmentId,
    cabins: seatMap.cabins.map((cabin) => ({
      cabinClass: cabin.cabinClass,
      rows: cabin.rows.map((row) => ({
        rowNumber: row.rowNumber,
        seats: row.seats.map((seat) => ({
          seatNumber: seat.seatNumber,
          isAvailable: seat.isAvailable,
          characteristics: [...seat.characteristics],
        })),
      })),
    })),
  };
}

/** flightStatus → FlightStatus (GET /flights/{n}/status). */
export function mapFlightStatusData({ flightStatus: s }: FlightStatusData): FlightStatusDto {
  const point = (p: FlightStatusData['flightStatus']['departure']): FlightStatusDto['departure'] => ({
    iataCode: p.iataCode,
    terminal: p.terminal,
    scheduledAt: p.scheduledAt,
    estimatedAt: p.estimatedAt,
    actualAt: p.actualAt,
  });
  return {
    flightNumber: s.flightNumber,
    date: s.date,
    marketingCarrier: s.marketingCarrier,
    operatingCarrier: s.operatingCarrier,
    departure: point(s.departure),
    arrival: point(s.arrival),
    aircraft: s.aircraft,
    status: s.status,
  };
}
