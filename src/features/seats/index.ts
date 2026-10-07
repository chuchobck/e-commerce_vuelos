/**
 * Selector de asientos (F5). Módulo independiente del checkout: no depende de su estado.
 * Uso, props y formato de lo que devuelve `onChange`: README, sección "Selector de asientos".
 */
export { SeatSelector } from './components/SeatSelector';
export { seatSegmentsFromLegs } from './segments';
export { seatablePassengers, toAssignedSeats } from './model/selection';
export type {
  AssignedSeat,
  SeatAssignments,
  SeatConflict,
  SeatConflictKind,
  SeatPassenger,
  SeatPassengerType,
  SeatSegment,
  SeatSelectorProps,
} from './types';
