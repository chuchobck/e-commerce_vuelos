/**
 * Forma de `data` que devuelve el BFF para las tres consultas, tal como la describe
 * contracts/bff-schema.graphql restringida a los campos que piden las consultas. A mano (sin
 * generador); las pruebas de contrato validan las consultas contra el esquema y las de paridad
 * comprueban que el resultado coincide con el de REST.
 */
import type { CabinClass, FlightStatusCode, PassengerTypeDto } from '../contract';

export interface GqlMoney {
  currency: string;
  total: string;
}

export interface GqlEndpoint {
  iataCode: string;
  at: string;
}

export interface GqlSegment {
  segmentId: string;
  flightNumber: string;
  departure: GqlEndpoint;
  arrival: GqlEndpoint;
  layoverMinutes: number | null;
  marketingCarrier: string;
  operatingCarrier: string;
  aircraft: string | null;
  durationMinutes: number | null;
}

export interface GqlCabinPricing {
  cabinClass: CabinClass;
  fareBrand: string;
  availableSeats: number;
  fareRules: { isRefundable: boolean; isChangeable: boolean };
  baggageAllowance: { personalItemIncluded: boolean; carryOnIncluded: number; checkedBaggageIncluded: number };
  extraCheckedBaggagePrice: GqlMoney | null;
  pricePerPassengerType: { passengerType: PassengerTypeDto; price: GqlMoney }[];
}

export interface GqlItinerary {
  itineraryId: string;
  totalDurationMinutes: number;
  stopsCount: number;
  segments: GqlSegment[];
  pricingOptions: GqlCabinPricing[];
}

export interface GqlOffer {
  offerId: string;
  airline: { code: string; name: string };
  grandTotal: GqlMoney;
  itineraries: GqlItinerary[];
}

export interface SearchFlightsData {
  searchFlights: { totalOffers: number; offers: GqlOffer[] };
}

export interface SeatMapData {
  seatMap: {
    segmentId: string;
    cabins: {
      cabinClass: CabinClass;
      rows: { rowNumber: number; seats: { seatNumber: string; isAvailable: boolean; characteristics: ('WINDOW' | 'AISLE' | 'EXTRA_LEGROOM' | 'EMERGENCY_EXIT')[] }[] }[];
    }[];
  };
}

export interface GqlStatusPoint {
  iataCode: string;
  terminal: string | null;
  scheduledAt: string;
  estimatedAt: string | null;
  actualAt: string | null;
}

export interface FlightStatusData {
  flightStatus: {
    flightNumber: string;
    date: string;
    marketingCarrier: string;
    operatingCarrier: string;
    status: FlightStatusCode;
    aircraft: string | null;
    departure: GqlStatusPoint;
    arrival: GqlStatusPoint;
  };
}
