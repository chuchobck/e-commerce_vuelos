/**
 * Formas del kiosko de check-in y del tablero de salidas.
 *
 * DISCREPANCIA: estas rutas (POST /kiosk/lookup, POST /kiosk/bookings/{id}/check-in, GET /kiosk/bookings/{id}/boarding-passes y
 * GET /airports/{iata}/departures) NO están en `contracts/vuelos-openapi.yaml`, así que no hay tipos generados. Las formas salen del
 * encargo de la fase y, las de salidas, de una consulta de solo lectura al despliegue real (README, sección 5f). Cuando el contrato las
 * incluya, esto se reemplaza por los tipos de `generated/`. El check-in y los pases del kiosko usan CheckInResponse y
 * BoardingPassListResponse del contrato.
 */

export interface KioskLookupRequestDto {
  pnr: string;
  lastName: string;
}

export type KioskWindowDto = 'OPEN' | 'NOT_YET_OPEN' | 'CLOSED';
export type KioskCheckInStatusDto = 'CHECKED_IN' | 'NOT_CHECKED_IN' | 'FAILED';

export interface KioskLookupResponseDto {
  kioskToken: string;
  expiresAt: string;
  booking: {
    bookingId: string;
    status: string;
    passengers: { passengerId: string; passengerType: string; firstName: string; lastName: string }[];
    flights: {
      segmentId: string;
      flightNumber: string;
      origin: string;
      destination: string;
      departureAt: string;
      arrivalAt: string;
      departureTerminal?: string | null;
      status: string;
      checkIn: { window: KioskWindowDto; opensAt?: string | null; closesAt?: string | null };
      passengers: { passengerId: string; seat?: string | null; checkInStatus: KioskCheckInStatusDto }[];
    }[];
  };
}

export interface DeparturesResponseDto {
  airport: { iataCode: string; name: string; city: string; timeZone: string };
  date: string;
  departures: {
    flightNumber: string;
    airline: string;
    destination: { iataCode: string; city: string };
    /** Hora LOCAL del aeropuerto con su desfase, p. ej. 2026-11-12T06:30:00-05:00. */
    scheduledTime: string;
    estimatedTime?: string | null;
    status: string;
    terminal?: string | null;
    gate?: string | null;
  }[];
  /** La API real no lo manda cuando no hay más páginas. */
  nextCursor?: string | null;
}
