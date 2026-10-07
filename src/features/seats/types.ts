import type { CabinClass } from '@/shared/api';

/** Tipos de pasajero de la API (PassengerItem.passengerType). */
export type SeatPassengerType = 'ADULT' | 'YOUTH' | 'CHILD' | 'INFANT';

/** Quien viaja. El `id` es el mismo `passengerId` que irá en PassengerItem. */
export interface SeatPassenger {
  id: string;
  name: string;
  type: SeatPassengerType;
}

/** Un tramo de vuelo con su mapa de asientos. `id` es el `segmentId` de la API. */
export interface SeatSegment {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  /** Hora local de salida (ISO con desfase). */
  departureTime: string;
  /** Cabina de la tarifa comprada: solo se pueden elegir asientos de esa cabina. */
  cabin: CabinClass;
  leg: 'outbound' | 'inbound';
  /** Posición del tramo dentro de su itinerario (0 = primero) y cuántos tramos tiene. */
  indexInLeg: number;
  legSize: number;
}

/**
 * Asientos elegidos: `passengerId → segmentId → seatNumber` (p. ej. `{ p1: { s1: '12A' } }`).
 * Un pasajero o un tramo sin entrada = "asignar automáticamente". Los bebés en brazos nunca aparecen.
 */
export type SeatAssignments = Record<string, Record<string, string>>;

/** Forma de PassengerItem.assignedSeats del contrato. */
export interface AssignedSeat {
  segmentId: string;
  seatNumber: string;
}

export type SeatConflictKind = 'SEAT_TAKEN' | 'CABIN_MISMATCH';

/** Un asiento elegido que dejó de servir. El selector ya lo quitó del valor cuando avisa. */
export interface SeatConflict {
  kind: SeatConflictKind;
  segmentId: string;
  passengerId?: string;
  seatNumber?: string;
  /** Asiento libre más cercano de la cabina correcta, si hay. */
  alternative?: string | null;
}

export interface SeatSelectorProps {
  /** `offerId` de la oferta (el mapa se pide con él). */
  offerId: string;
  segments: SeatSegment[];
  passengers: SeatPassenger[];
  /** Asientos elegidos (el componente es controlado). `{}` = todo automático. */
  value: SeatAssignments;
  onChange: (next: SeatAssignments) => void;
  /**
   * Avisa que un asiento elegido ya no sirve (se ocupó o no es de la cabina). Llega después de que
   * `onChange` ya entregó el valor sin ese asiento.
   */
  onConflict?: (conflict: SeatConflict) => void;
  /**
   * Error de `POST /bookings` que debe explicarse aquí: 409 SEAT_TAKEN o 422 SEAT_CABIN_MISMATCH.
   * Se procesa cada vez que cambia la referencia del objeto; `null` o `undefined` no hace nada.
   */
  serverError?: unknown;
  className?: string;
}
