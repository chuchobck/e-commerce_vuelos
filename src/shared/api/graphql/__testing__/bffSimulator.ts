/**
 * Un «BFF de mentira» para las pruebas, sin red: valida una consulta contra contracts/bff-schema.graphql
 * y la ejecuta con graphql-js sobre datos de prueba, como lo haría GraphQL: devuelve SOLO los campos que la consulta selecciona.
 * Así una prueba de paridad falla si la consulta deja de pedir algo que el mapeo necesita, y también si
 * pide un campo que el esquema no tiene. Los convertidores `*ToBff` parten de las respuestas REST ya
 * versionadas (__fixtures__) y las pasan a la forma completa del BFF (con `null` donde REST omite).
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildSchema, execute, parse, validate, type ExecutionResult, type GraphQLError, type OperationDefinitionNode } from 'graphql';
import type { FlightStatusDto, MoneyDto, SearchResponseDto, SeatMapDto } from '../../contract';

const root = path.resolve(__dirname, '../../../../..');
export const bffSchemaText = fs.readFileSync(path.join(root, 'contracts/bff-schema.graphql'), 'utf8');
export const bffSchema = buildSchema(bffSchemaText);

/** Errores de validar la consulta contra el esquema (vacío = válida). */
export function validateQuery(query: string): readonly GraphQLError[] {
  return validate(bffSchema, parse(query));
}

export function operationOf(query: string): OperationDefinitionNode {
  const op = parse(query).definitions.find((d): d is OperationDefinitionNode => d.kind === 'OperationDefinition');
  if (!op) throw new Error('la consulta no tiene operación');
  return op;
}

/**
 * Ejecuta la consulta con graphql-js contra el esquema del BFF y los datos `full` (la respuesta completa del
 * campo raíz). GraphQL responde solo lo seleccionado, valida los valores de los enums y la nulabilidad, y
 * exige variables del tipo declarado: es lo que haría el BFF. Si hay errores, la respuesta los trae.
 */
export function bffExecute(query: string, variables: Record<string, unknown> | undefined, full: Record<string, unknown>) {
  // Como el servidor: una consulta que no cumple el esquema no se ejecuta (GRAPHQL_VALIDATION_FAILED).
  const invalid = validateQuery(query);
  if (invalid.length > 0) {
    return { errors: invalid.map((e) => ({ message: e.message, extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } })) };
  }
  const result = execute({
    schema: bffSchema,
    document: parse(query),
    rootValue: full,
    variableValues: variables,
  }) as ExecutionResult;
  return JSON.parse(JSON.stringify(result)) as { data?: unknown; errors?: { message: string; extensions?: { code: string } }[] };
}

const moneyFull = (m: MoneyDto) => ({ currency: m.currency, baseFare: m.baseFare ?? null, taxes: m.taxes ?? null, total: m.total });

/** SearchResponse del core (REST) → `data.searchFlights` completo del BFF. */
export function searchToBff(dto: SearchResponseDto) {
  return {
    searchFlights: {
      totalOffers: dto.totalOffers,
      offers: dto.offers.map((o) => ({
        offerId: o.offerId,
        airline: { code: o.airline.code ?? '', name: o.airline.name ?? '' },
        grandTotal: moneyFull(o.grandTotal),
        itineraries: o.itineraries.map((it) => ({
          itineraryId: it.itineraryId,
          totalDurationMinutes: it.totalDurationMinutes,
          stopsCount: it.stopsCount,
          segments: it.segments.map((s) => ({
            segmentId: s.segmentId,
            flightNumber: s.flightNumber,
            departure: { iataCode: s.departure.iataCode, at: s.departure.at, terminal: s.departure.terminal ?? null },
            arrival: { iataCode: s.arrival.iataCode, at: s.arrival.at, terminal: s.arrival.terminal ?? null },
            layoverMinutes: s.layoverMinutes ?? null,
            marketingCarrier: s.marketingCarrier,
            operatingCarrier: s.operatingCarrier,
            aircraft: s.aircraft ?? null,
            durationMinutes: s.durationMinutes ?? null,
            status: s.status ?? null,
            seatMap: null,
          })),
          pricingOptions: it.pricingOptions.map((p) => ({
            cabinClass: p.cabinClass,
            fareBrand: p.fareBrand,
            availableSeats: p.availableSeats,
            fareRules: p.fareRules,
            baggageAllowance: {
              personalItemIncluded: p.baggageAllowance.personalItemIncluded ?? false,
              carryOnIncluded: p.baggageAllowance.carryOnIncluded ?? 0,
              checkedBaggageIncluded: p.baggageAllowance.checkedBaggageIncluded ?? 0,
            },
            extraCheckedBaggagePrice: p.extraCheckedBaggagePrice ? moneyFull(p.extraCheckedBaggagePrice) : null,
            pricePerPassengerType: p.pricePerPassengerType.map((x) => ({
              passengerType: x.passengerType,
              price: moneyFull(x.price as MoneyDto),
            })),
          })),
        })),
      })),
    },
  };
}

/** SeatMapResponse del core → `data.seatMap` completo del BFF. */
export function seatMapToBff(dto: SeatMapDto) {
  return { seatMap: dto };
}

/** FlightStatus del core → `data.flightStatus` completo del BFF. */
export function statusToBff(dto: FlightStatusDto) {
  const point = (p: FlightStatusDto['departure']) => ({
    iataCode: p.iataCode,
    terminal: p.terminal ?? null,
    scheduledAt: p.scheduledAt,
    estimatedAt: p.estimatedAt ?? null,
    actualAt: p.actualAt ?? null,
  });
  return {
    flightStatus: {
      flightNumber: dto.flightNumber,
      date: dto.date,
      marketingCarrier: dto.marketingCarrier,
      operatingCarrier: dto.operatingCarrier,
      status: dto.status,
      aircraft: dto.aircraft ?? null,
      departure: point(dto.departure),
      arrival: point(dto.arrival),
    },
  };
}

/** Un mapa de asientos del core, con cabinas, filas y características variadas (incluye `[]`). */
export const SEAT_MAP_REST: SeatMapDto = {
  segmentId: 'dfba95d2-7a0c-4857-aa36-10781acd5d96',
  cabins: [
    {
      cabinClass: 'BUSINESS',
      rows: [
        {
          rowNumber: 1,
          seats: [
            { seatNumber: '1A', isAvailable: true, characteristics: ['WINDOW', 'EXTRA_LEGROOM'] },
            { seatNumber: '1C', isAvailable: false, characteristics: ['AISLE'] },
          ],
        },
      ],
    },
    {
      cabinClass: 'ECONOMY',
      rows: [
        {
          rowNumber: 12,
          seats: [
            { seatNumber: '12A', isAvailable: true, characteristics: ['WINDOW', 'EMERGENCY_EXIT'] },
            { seatNumber: '12B', isAvailable: true, characteristics: [] },
            { seatNumber: '12C', isAvailable: false, characteristics: ['AISLE'] },
          ],
        },
      ],
    },
  ],
};
