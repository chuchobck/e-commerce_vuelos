/**
 * Formas del contrato (generadas desde contracts/vuelos-openapi.yaml con `npm run api:types`).
 * Este archivo solo les pone nombre: nunca se redefinen a mano.
 */
import type { components as identity } from './generated/identity';
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
export type HoldResponseDto = Schemas['HoldResponse'];
export type HoldStatusDto = Schemas['HoldStatusResponse'];
export type BookingRequestDto = Schemas['BookingRequest'];
export type PassengerItemDto = Schemas['PassengerItem'];
export type BookingDetailDto = Schemas['BookingDetail'];
export type TicketDto = Schemas['Ticket'];
export type TicketListDto = Schemas['TicketListResponse'];
export type BookingListDto = Schemas['BookingListResponse'];
export type BaggageOptionDto = Schemas['BaggageOptionsResponse'][number];
export type AddBaggageRequestDto = Schemas['AddBaggageRequest'];
export type BaggageAddedDto = Schemas['BaggageAddedResponse'];
export type DateChangeSearchRequestDto = Schemas['DateChangeSearchRequest'];
export type DateChangeOptionDto = Schemas['DateChangeSearchResponse'][number];
export type DateChangeRequestDto = Schemas['DateChangeRequest'];
export type CancellationQuoteDto = Schemas['CancellationQuoteResponse'];
export type CancelBookingRequestDto = Schemas['CancelBookingRequest'];
export type CheckInResponseDto = Schemas['CheckInResponse'];
export type BoardingPassDto = Schemas['BoardingPass'];
export type PaymentReferenceDto = Schemas['PaymentReference'];
export type BoardingPassListDto = Schemas['BoardingPassListResponse'];

/** Cabinas del contrato. */
export type CabinClass = CabinPricingDto['cabinClass'];
/** Estados operativos de un vuelo según el contrato. */
export type FlightStatusCode = FlightStatusDto['status'];
/** Códigos de error que puede traer un ProblemDetails. */
export type ProblemCode = ProblemDetailsDto['code'];

/**
 * Cuenta (`/identity/v1/auth/*`). No está en el contrato del core: los tipos se generan del OpenAPI de identity
 * (contracts/identity-openapi.json → generated/identity.ts). Tienen la misma forma que tenían en el core.
 */
type IdentitySchemas = identity['schemas'];
export type RegisterRequestDto = IdentitySchemas['RegistroDto'];
export type LoginRequestDto = IdentitySchemas['LoginDto'];
export type RefreshRequestDto = IdentitySchemas['RefrescoDto'];
export type TokenResponseDto = IdentitySchemas['TokenRespuestaDto'];
export type UserResponseDto = IdentitySchemas['UsuarioRespuestaDto'];

/**
 * Tipos de pasajero que devuelve la API en `pricePerPassengerType` (el contrato los deja como
 * texto libre; estos son los que responde de verdad).
 */
export type PassengerTypeDto = 'ADULT' | 'YOUTH' | 'CHILD' | 'INFANT';
