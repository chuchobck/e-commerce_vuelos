import type { FlightsApi } from './FlightsApi';
import { FLIGHT_STATUS_OPERATION, FLIGHT_STATUS_QUERY } from './graphql/flightStatus';
import { mapFlightStatusData, mapSearchData, mapSeatMapData } from './graphql/mapping';
import { SEARCH_FLIGHTS_OPERATION, SEARCH_FLIGHTS_QUERY } from './graphql/searchFlights';
import { SEAT_MAP_OPERATION, SEAT_MAP_QUERY } from './graphql/seatMap';
import type { FlightStatusData, SearchFlightsData, SeatMapData } from './graphql/types';
import type { HttpClient } from './http/client';
import { deviceFingerprint } from './http/deviceFingerprint';
import type { GraphqlClient } from './http/graphqlClient';
import { mapFlightStatus, mapSearchResponse, toSearchRequest } from './mapping';
import { RealFlightsApi } from './RealFlightsApi';
import type { FlightStatus, SearchOptions, SearchParams, SearchResult, SeatMap } from './types';

/**
 * Modo «API real + BFF GraphQL» (VITE_API_URL y VITE_GRAPHQL_URL con valor). Las TRES lecturas públicas
 * —búsqueda, mapa de asientos y estado de vuelo— van por GraphQL al BFF; todo lo demás (cuenta, compra y
 * postventa) sigue por REST directo al core, con Bearer e Idempotency-Key, heredado de RealFlightsApi.
 * Cada respuesta se convierte al mismo DTO de REST y pasa por el mismo mapeo: la interfaz no nota la diferencia.
 */
export class GraphqlFlightsApi extends RealFlightsApi implements FlightsApi {
  constructor(
    http: HttpClient,
    private readonly graphql: GraphqlClient,
  ) {
    super(http);
  }

  override async search(params: SearchParams, options: SearchOptions = {}): Promise<SearchResult> {
    const data = await this.graphql.request<SearchFlightsData>({
      query: SEARCH_FLIGHTS_QUERY,
      operationName: SEARCH_FLIGHTS_OPERATION,
      // SearchInput tiene la misma forma que el cuerpo de POST /search.
      variables: { input: toSearchRequest(params) },
      headers: { 'X-Device-Fingerprint': deviceFingerprint() },
      retry: options.retry ?? true,
      signal: options.signal,
    });
    return mapSearchResponse(mapSearchData(data), params);
  }

  override async getSeatMap(offerId: string, segmentId: string): Promise<SeatMap> {
    const data = await this.graphql.request<SeatMapData>({
      query: SEAT_MAP_QUERY,
      operationName: SEAT_MAP_OPERATION,
      variables: { offerId, segmentId },
    });
    return mapSeatMapData(data);
  }

  override async getFlightStatus(flightNumber: string, date: string): Promise<FlightStatus> {
    const data = await this.graphql.request<FlightStatusData>({
      query: FLIGHT_STATUS_QUERY,
      operationName: FLIGHT_STATUS_OPERATION,
      variables: { flightNumber, date },
    });
    return mapFlightStatus(mapFlightStatusData(data));
  }
}
