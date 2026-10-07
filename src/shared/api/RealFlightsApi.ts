import type { FlightStatusDto, SearchResponseDto, SeatMapDto, TokenResponseDto, UserResponseDto } from './contract';
import { NotYetConnectedError } from './errors';
import type { FlightsApi } from './FlightsApi';
import type { HttpClient } from './http/client';
import { deviceFingerprint } from './http/deviceFingerprint';
import { mapFlightStatus, mapSearchResponse, mapTokens, mapUser, toSearchRequest } from './mapping';
import type { AuthTokens, Credentials, FlightStatus, SearchParams, SearchResult, SeatMap, User } from './types';

/**
 * Implementación contra la API real: las operaciones públicas (búsqueda, mapa de asientos y
 * estado de vuelo, F2) y la cuenta (F3). Hold, reservas y postventa lanzan NotYetConnectedError,
 * que la interfaz explica sin romper la pantalla; se conectan en F4 y F6.
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

  /* Cuenta. Las escrituras no se reintentan solas; /auth/me es una lectura. */

  async register({ email, password }: Credentials): Promise<User> {
    return mapUser(await this.http.request<UserResponseDto>('POST', '/auth/register', { body: { email, password } }));
  }

  async login({ email, password }: Credentials): Promise<AuthTokens> {
    return mapTokens(await this.http.request<TokenResponseDto>('POST', '/auth/login', { body: { email, password } }));
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    return mapTokens(await this.http.request<TokenResponseDto>('POST', '/auth/refresh', { body: { refresh_token: refreshToken } }));
  }

  async logout(refreshToken: string): Promise<void> {
    await this.http.request('POST', '/auth/logout', { body: { refresh_token: refreshToken }, auth: true });
  }

  async me(): Promise<User> {
    return mapUser(await this.http.request<UserResponseDto>('GET', '/auth/me', { auth: true, retry: true }));
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
}
