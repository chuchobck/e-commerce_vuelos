import type { FlightStatusDto, SearchResponseDto, SeatMapDto } from './contract';
import { NotYetConnectedError } from './errors';
import type { FlightsApi } from './FlightsApi';
import type { HttpClient } from './http/client';
import { deviceFingerprint } from './http/deviceFingerprint';
import { mapFlightStatus, mapSearchResponse, toSearchRequest } from './mapping';
import type { FlightStatus, SearchParams, SearchResult, SeatMap } from './types';

/**
 * Implementación contra la API real. En F2 solo están conectadas las operaciones públicas
 * (búsqueda, mapa de asientos y estado de vuelo); las demás lanzan NotYetConnectedError, que la
 * interfaz muestra con su patrón de errores sin romper la pantalla. Se conectan en F3, F4 y F6.
 */
export class RealFlightsApi implements FlightsApi {
  constructor(private readonly http: HttpClient) {}

  async search(params: SearchParams): Promise<SearchResult> {
    // POST de solo lectura: admite el reintento de lecturas.
    const dto = await this.http.request<SearchResponseDto>('POST', '/search', {
      body: toSearchRequest(params),
      headers: { 'X-Device-Fingerprint': deviceFingerprint() },
      retry: true,
    });
    return mapSearchResponse(dto, params);
  }

  getSeatMap(offerId: string, segmentId: string): Promise<SeatMap> {
    return this.http.request<SeatMapDto>('GET', `/offers/${encodeURIComponent(offerId)}/seatmap`, {
      query: { segmentId },
      retry: true,
    });
  }

  async getFlightStatus(flightNumber: string, date: string): Promise<FlightStatus> {
    const dto = await this.http.request<FlightStatusDto>('GET', `/flights/${encodeURIComponent(flightNumber)}/status`, {
      query: { date },
      retry: true,
    });
    return mapFlightStatus(dto);
  }

  /** GET /health sin aviso de "despertando": despierta el servidor mientras el usuario escribe. */
  async warmUp(): Promise<void> {
    await this.http.request('GET', '/health', { silent: true });
  }

  async createHold(): Promise<never> {
    throw new NotYetConnectedError('createHold');
  }
  async getHold(): Promise<never> {
    throw new NotYetConnectedError('getHold');
  }
  async cancelHold(): Promise<never> {
    throw new NotYetConnectedError('cancelHold');
  }
  async createBooking(): Promise<never> {
    throw new NotYetConnectedError('createBooking');
  }
  async listBookings(): Promise<never> {
    throw new NotYetConnectedError('listBookings');
  }
  async getBooking(): Promise<never> {
    throw new NotYetConnectedError('getBooking');
  }
  async cancelBooking(): Promise<never> {
    throw new NotYetConnectedError('cancelBooking');
  }
  async checkIn(): Promise<never> {
    throw new NotYetConnectedError('checkIn');
  }
  async getBoardingPasses(): Promise<never> {
    throw new NotYetConnectedError('getBoardingPasses');
  }
  async login(): Promise<never> {
    throw new NotYetConnectedError('login');
  }
  async register(): Promise<never> {
    throw new NotYetConnectedError('register');
  }
}
