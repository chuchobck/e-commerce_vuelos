/**
 * Formas del contrato (generadas desde contracts/vuelos-openapi.yaml con `npm run api:types`).
 * Este archivo solo les pone nombre: nunca se redefinen a mano.
 */
import type { components } from './generated/vuelos';

type Schemas = components['schemas'];

export type SearchRequestDto = Schemas['SearchRequest'];
export type SearchResponseDto = Schemas['SearchResponse'];
export type FlightOfferDto = Schemas['FlightOffer'];
export type ItineraryDto = Schemas['ItineraryOption'];
export type SegmentDto = Schemas['FlightSegment'];
export type CabinPricingDto = Schemas['CabinPricing'];
export type MoneyDto = Schemas['MoneyAmount'];
export type PassengerBreakdownDto = Schemas['PassengerBreakdown'];
export type SeatMapDto = Schemas['SeatMapResponse'];
export type FlightStatusDto = Schemas['FlightStatus'];
export type ProblemDetailsDto = Schemas['ProblemDetails'];
export type HoldRequestDto = Schemas['HoldRequest'];

/** Cabinas del contrato. */
export type CabinClass = CabinPricingDto['cabinClass'];
/** Estados operativos de un vuelo según el contrato. */
export type FlightStatusCode = FlightStatusDto['status'];
/** Códigos de error que puede traer un ProblemDetails. */
export type ProblemCode = ProblemDetailsDto['code'];

/**
 * Tipos de pasajero que devuelve la API en `pricePerPassengerType` (el contrato los deja como
 * texto libre; estos son los que responde de verdad).
 */
export type PassengerTypeDto = 'ADULT' | 'YOUTH' | 'CHILD' | 'INFANT';
