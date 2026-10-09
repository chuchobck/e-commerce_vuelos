/**
 * Postventa del mock con las reglas de la API real (contrato, "Postventa", "Check-in y Boarding Pass" y
 * "Reservas y Emisión"): check-in por bookingId, pases, equipaje, cambio de fecha y cancelación con cotización.
 * Trabaja sobre la forma del contrato; MockFlightsApi la mapea igual que la API real.
 *
 * Pagos: el prefijo de la referencia decide (PAY-OK- aprobado, PAY-PEND- pendiente → 202, PAY-REJ- → 422).
 * Idempotency-Key: misma clave y mismo cuerpo repiten la respuesta; misma clave con otro cuerpo, 422.
 * Todo lo que el contrato no define queda marcado como DISCREPANCIA (docs/DISCREPANCIAS-F6.md).
 */
import { parseMoney, toDecimalString, zeroMoney, type Money } from '@/shared/lib/money';
import { checkInWindow } from '@/shared/lib/checkin';
import { stableHash } from '@/shared/lib/stableHash';
import type {
  AddBaggageRequestDto,
  BaggageAddedDto,
  BaggageOptionDto,
  BoardingPassListDto,
  BookingDetailDto,
  BookingListDto,
  CancelBookingRequestDto,
  CancellationQuoteDto,
  CheckInResponseDto,
  DateChangeOptionDto,
  DateChangeRequestDto,
  DateChangeSearchRequestDto,
  ItineraryDto,
  PaymentReferenceDto,
  TicketDto,
  TicketListDto,
} from '../contract';
import { ApiError } from '../errors';
import { toAirportLocalIso } from '../mapping';
import { mockSearch } from './generators';
import { checkKey, firstFreeSeat, PAYMENT_FORMAT, PENDING_ISSUE_MS, problem, SIMULATED_PAYMENT } from './purchase';
import type { MockDb, StoredBooking, StoredChangeOffer, StoredIdempotencyKey } from './store';

/** Máximo de maletas extra por pasajero y itinerario (DISCREPANCIA: el contrato solo expone `maxAllowed`, no cómo se fija). */
const MAX_EXTRA_BAGS = 3;
/** Cargo por cambio de fecha, por pasajero que ocupa asiento, según la familia. Los valores son del mock. */
const CHANGE_FEE_USD: Record<string, number> = { CLASSIC: 25, FLEX: 0, BUSINESS_FLEX: 0 };
const CHANGE_OFFER_MINUTES = 15;
const QUOTE_MINUTES = 10;
const CANCEL_PENALTY_RATE = 0.1;
const LIST_MAX = 50;
const LIST_DEFAULT = 10;

const iso = (ms: number) => new Date(ms).toISOString();
const usd = (cents: number) => toDecimalString({ cents, currency: 'USD' });

/* ------------------------------------------ utilidades ------------------------------------------ */

function requireConfirmed(stored: StoredBooking) {
  if (stored.dto.status === 'CANCELLED') throw problem(409, 'ALREADY_CANCELLED', 'The booking is already cancelled');
  if (stored.dto.status !== 'CONFIRMED') throw problem(409, 'BOOKING_NOT_CONFIRMED', `The booking is ${stored.dto.status}, not CONFIRMED`);
}

/** Maletas extra y vuelo de cada pasajero que ocupa asiento (los infantes viajan en brazos y no tienen maleta). */
const seated = (dto: BookingDetailDto) => (dto.passengers ?? []).filter((p) => p.passengerType !== 'INFANT');

function firstSegmentDeparture(dto: BookingDetailDto): { at: string; origin: string } {
  const segment = dto.itineraries?.[0]?.segments[0];
  if (!segment) throw problem(409, 'VALIDATION_FAILED', 'The booking has no itineraries');
  return { at: toAirportLocalIso(segment.departure.at, segment.departure.iataCode), origin: segment.departure.iataCode };
}

/** Repite el resultado de una petición ya hecha con esta clave; con otro cuerpo, 422. */
function replayOf(db: MockDb, scope: StoredIdempotencyKey['scope'], ownerId: string, key: string, body: unknown): StoredIdempotencyKey | null {
  const found = db.idempotency.find((k) => k.scope === scope && k.ownerId === ownerId && k.key === key);
  if (!found) return null;
  if (found.bodyHash !== stableHash(body)) {
    throw problem(422, 'VALIDATION_FAILED', 'This Idempotency-Key was already used with a different request body', 'Idempotency-Key', 'already used with another body');
  }
  return found;
}

function remember(db: MockDb, scope: StoredIdempotencyKey['scope'], ownerId: string, key: string, body: unknown, resultId: string, outcome: 'done' | 'pending') {
  db.idempotency.push({ scope, ownerId, key, bodyHash: stableHash(body), resultId, outcome });
}

/**
 * Cobra con la referencia de la Payment API simulada: devuelve 'OK' o 'PEND'; lanza 400 (formato), 409 (reusada)
 * o 422 (no es de la Payment API, o rechazada). La referencia solo se consume cuando el cobro no se rechaza.
 */
function charge(db: MockDb, payment: PaymentReferenceDto | undefined, field: string): 'OK' | 'PEND' {
  if (!payment?.paymentReference) throw problem(422, 'VALIDATION_FAILED', `${field}: is required`, field, 'is required');
  const reference = payment.paymentReference;
  if (!PAYMENT_FORMAT.test(reference)) throw problem(400, 'VALIDATION_FAILED', `${field}.paymentReference: must be 8 to 64 letters, digits or _ . : -`, `${field}.paymentReference`, 'format');
  if (db.paymentReferences.includes(reference)) throw problem(409, 'PAYMENT_REFERENCE_INVALID', `${field}.paymentReference: was already used for another operation`);
  const outcome = SIMULATED_PAYMENT.exec(reference)?.[1];
  if (!outcome) throw problem(422, 'PAYMENT_REFERENCE_INVALID', `${field}.paymentReference: is not a payment of the Payment API`, `${field}.paymentReference`, 'unknown payment');
  if (outcome === 'REJ') throw problem(422, 'PAYMENT_NOT_AUTHORIZED', 'The payment was not authorized by the Payment API');
  db.paymentReferences.push(reference);
  return outcome === 'OK' ? 'OK' : 'PEND';
}

/* ------------------------------------------- lectura ------------------------------------------- */

/** GET /bookings: más recientes primero (DISCREPANCIA: el contrato no dice el orden), cursor = posición. */
export function listBookings(db: MockDb, ownerId: string, query: { cursor?: string; limit?: number }): BookingListDto {
  const limit = query.limit ?? LIST_DEFAULT;
  if (!Number.isInteger(limit) || limit < 1 || limit > LIST_MAX) {
    throw problem(400, 'VALIDATION_FAILED', `limit: must be between 1 and ${LIST_MAX}`, 'limit', `must be between 1 and ${LIST_MAX}`);
  }
  const offset = query.cursor === undefined ? 0 : Number(query.cursor);
  if (!Number.isInteger(offset) || offset < 0) throw problem(400, 'VALIDATION_FAILED', 'cursor: is not valid', 'cursor', 'is not valid');
  const mine = db.bookings
    .filter((b) => b.ownerId === ownerId)
    .sort((a, b) => b.dto.createdAt.localeCompare(a.dto.createdAt) || a.dto.bookingId.localeCompare(b.dto.bookingId));
  const page = mine.slice(offset, offset + limit);
  return {
    items: page.map(({ dto }) => {
      const segments = dto.itineraries?.[0]?.segments ?? [];
      const first = segments[0];
      const last = segments[segments.length - 1];
      return {
        bookingId: dto.bookingId,
        pnr: dto.pnr,
        status: dto.status,
        origin: first?.departure.iataCode,
        destination: last?.arrival.iataCode,
        // DISCREPANCIA: el contrato dice `date` sin zona; aquí es la fecha local del aeropuerto de salida.
        departureDate: first ? toAirportLocalIso(first.departure.at, first.departure.iataCode).slice(0, 10) : undefined,
        grandTotal: dto.grandTotal,
      };
    }),
    ...(offset + limit < mine.length ? { nextCursor: String(offset + limit) } : {}),
  };
}

export function ticketsOf(stored: StoredBooking): TicketListDto {
  return { bookingId: stored.dto.bookingId, tickets: stored.dto.tickets ?? [] };
}

export function ticketOf(stored: StoredBooking, ticketId: string): TicketDto {
  const ticket = (stored.dto.tickets ?? []).find((t) => t.ticketId === ticketId);
  if (!ticket) throw problem(404, 'VALIDATION_FAILED', `Ticket ${ticketId} was not found`);
  return ticket;
}

/* ------------------------------------------- check-in ------------------------------------------- */

/**
 * POST /bookings/{id}/check-in. Solo reservas confirmadas y dentro de la ventana (48 h a 60 min antes de la salida
 * del primer vuelo). Hacerlo dos veces devuelve lo mismo (200). DISCREPANCIA: el contrato no dice a qué tramos
 * alcanza; aquí, a los del itinerario de ida.
 */
export function checkIn(stored: StoredBooking, now: number): CheckInResponseDto {
  const { dto } = stored;
  if (dto.status === 'CANCELLED') throw problem(409, 'CHECK_IN_NOT_AVAILABLE', 'The booking is cancelled');
  if (dto.status !== 'CONFIRMED') throw problem(409, 'CHECK_IN_NOT_AVAILABLE', 'The booking is not confirmed');
  if (!stored.checkedIn) {
    const window = checkInWindow(firstSegmentDeparture(dto).at, new Date(now));
    if (window.status !== 'open') {
      throw problem(409, 'CHECK_IN_NOT_AVAILABLE', window.status === 'closed' ? 'Check-in closed 60 minutes before departure' : 'Check-in opens 48 hours before departure');
    }
    stored.checkedIn = true;
  }
  const outbound = dto.itineraries?.[0]?.segments ?? [];
  return {
    bookingId: dto.bookingId,
    status: 'COMPLETED',
    checkedInPassengers: (dto.passengers ?? []).map((p) => ({
      passengerId: p.passengerId,
      status: 'CHECKED_IN',
      segments:
        p.passengerType === 'INFANT'
          ? []
          : outbound.map((s) => ({ segmentId: s.segmentId, seat: p.assignedSeats?.find((a) => a.segmentId === s.segmentId)?.seatNumber ?? null, status: 'CHECKED_IN' as const })),
    })),
  };
}

/** GET /bookings/{id}/boarding-passes: un pase por pasajero y tramo de ida. Antes del check-in, 409. */
export function boardingPasses(stored: StoredBooking): BoardingPassListDto {
  if (!stored.checkedIn) throw problem(409, 'BOARDING_PASS_NOT_AVAILABLE', 'Check-in has not been done');
  const { dto } = stored;
  const outbound = dto.itineraries?.[0]?.segments ?? [];
  const group = dto.itineraries?.[0]?.pricingOptions[0]?.fareBrand;
  const rank = group === 'BASIC' ? '3' : group === 'CLASSIC' ? '2' : '1';
  let position = 0;
  return {
    bookingId: dto.bookingId,
    boardingPasses: seated(dto).flatMap((p) =>
      outbound.map((s) => {
        position += 1;
        const seat = p.assignedSeats?.find((a) => a.segmentId === s.segmentId)?.seatNumber ?? '';
        return {
          passengerId: p.passengerId,
          segmentId: s.segmentId,
          seat,
          boardingGroup: rank,
          boardingPosition: String(position).padStart(3, '0'),
          // Texto de código del mock (parecido a un BCBP de IATA); la interfaz lo muestra tal cual.
          barcode: `M1${p.lastName}/${p.firstName}`.toUpperCase().replace(/[^A-Z0-9/]/g, '').slice(0, 20) + ` E${dto.pnr} ${s.departure.iataCode}${s.arrival.iataCode}${s.marketingCarrier} ${s.flightNumber.replace(/\D/g, '')} ${seat}`,
          barcodeType: 'QR' as const,
        };
      }),
    ),
  };
}

/* ------------------------------------------- equipaje ------------------------------------------- */

/** El precio de una maleta extra de un itinerario, tal como lo vendió la tarifa (o 35 USD si no lo trae). */
function extraBagPrice(itinerary: ItineraryDto): { currency: string; total: string } {
  return itinerary.pricingOptions[0]?.extraCheckedBaggagePrice ?? { currency: 'USD', total: usd(3500) };
}

const purchased = (dto: BookingDetailDto, passengerId: string, itineraryId: string) =>
  (dto.passengers ?? []).find((p) => p.passengerId === passengerId)?.extraBaggage?.find((b) => b.itineraryId === itineraryId)?.quantity ?? 0;

/** GET /bookings/{id}/baggage-options: una opción por pasajero que ocupa asiento y por itinerario. */
export function baggageOptions(stored: StoredBooking): BaggageOptionDto[] {
  requireConfirmed(stored);
  const { dto } = stored;
  return seated(dto).flatMap((p) =>
    (dto.itineraries ?? []).map((it) => ({
      passengerId: p.passengerId,
      itineraryId: it.itineraryId,
      price: extraBagPrice(it),
      maxAllowed: MAX_EXTRA_BAGS,
      alreadyPurchased: purchased(dto, p.passengerId, it.itineraryId),
    })),
  );
}

function applyBaggage(dto: BookingDetailDto, passengerId: string, itineraryId: string, quantity: number): number {
  const passenger = (dto.passengers ?? []).find((p) => p.passengerId === passengerId);
  if (!passenger) return 0;
  const list = passenger.extraBaggage ?? [];
  const current = list.find((b) => b.itineraryId === itineraryId);
  if (current) current.quantity += quantity;
  else list.push({ itineraryId, quantity });
  passenger.extraBaggage = list;
  return current?.quantity ?? quantity;
}

/**
 * POST /bookings/{id}/baggage. 200 con el total de maletas; PAY-PEND- → 202 (se aplica a los 20 s); PAY-REJ- → 422;
 * pasar el máximo → 409 BAGGAGE_LIMIT_EXCEEDED.
 */
export function addBaggage(
  db: MockDb,
  stored: StoredBooking,
  ownerId: string,
  body: AddBaggageRequestDto,
  key: string,
  now: number,
): { outcome: 'done'; data: BaggageAddedDto } | { outcome: 'pending' } {
  checkKey(key);
  const replayed = replayOf(db, 'baggage', ownerId, key, body);
  if (replayed) {
    return replayed.outcome === 'pending'
      ? { outcome: 'pending' }
      : { outcome: 'done', data: { passengerId: body.passengerId, itineraryId: body.itineraryId, totalBaggage: purchased(stored.dto, body.passengerId, body.itineraryId) } };
  }
  requireConfirmed(stored);
  const { dto } = stored;
  const passenger = seated(dto).find((p) => p.passengerId === body.passengerId);
  if (!passenger) throw problem(422, 'VALIDATION_FAILED', 'passengerId: is not a passenger with a seat of this booking', 'passengerId', 'not a passenger with a seat');
  if (!(dto.itineraries ?? []).some((it) => it.itineraryId === body.itineraryId)) {
    throw problem(422, 'VALIDATION_FAILED', 'itineraryId: is not an itinerary of this booking', 'itineraryId', 'not an itinerary of this booking');
  }
  if (!Number.isInteger(body.quantity) || body.quantity < 1) throw problem(400, 'VALIDATION_FAILED', 'quantity: must not be less than 1', 'quantity', 'must not be less than 1');
  if (purchased(dto, body.passengerId, body.itineraryId) + body.quantity > MAX_EXTRA_BAGS) {
    throw problem(409, 'BAGGAGE_LIMIT_EXCEEDED', `A passenger can carry at most ${MAX_EXTRA_BAGS} extra bags`);
  }
  const outcome = charge(db, body.payment, 'payment');
  if (outcome === 'PEND') {
    stored.pending = { kind: 'baggage', applyAfter: iso(now + PENDING_ISSUE_MS), passengerId: body.passengerId, itineraryId: body.itineraryId, quantity: body.quantity };
    remember(db, 'baggage', ownerId, key, body, dto.bookingId, 'pending');
    return { outcome: 'pending' };
  }
  const total = applyBaggage(dto, body.passengerId, body.itineraryId, body.quantity);
  dto.updatedAt = iso(now);
  dto.changes = [...(dto.changes ?? []), { changedAt: iso(now), description: `${body.quantity} extra bag(s) added for ${body.passengerId}` }];
  remember(db, 'baggage', ownerId, key, body, dto.bookingId, 'done');
  return { outcome: 'done', data: { passengerId: body.passengerId, itineraryId: body.itineraryId, totalBaggage: total } };
}

/* ---------------------------------------- cambio de fecha ---------------------------------------- */

/** Precio de un itinerario para los pasajeros de la reserva, en centavos: [tarifa base, impuestos]. */
function itineraryCents(itinerary: ItineraryDto, brand: string, cabin: string, counts: Record<string, number>): [number, number] | null {
  const option = itinerary.pricingOptions.find((o) => o.fareBrand === brand && o.cabinClass === cabin);
  if (!option) return null;
  let base = 0;
  let taxes = 0;
  for (const [type, count] of Object.entries(counts)) {
    const price = option.pricePerPassengerType.find((p) => p.passengerType === type)?.price;
    if (!price || count === 0) continue;
    base += parseMoney(price.baseFare ?? price.total, price.currency).cents * count;
    taxes += parseMoney(price.taxes ?? '0.00', price.currency).cents * count;
  }
  return [base, taxes];
}

/** Lo que se pagó por el itinerario: el mismo vuelo, buscado en su fecha (el mock no guarda el desglose por itinerario). */
function paidCents(itinerary: ItineraryDto, brand: string, cabin: string, counts: Record<string, number>): [number, number] | null {
  const first = itinerary.segments[0];
  const last = itinerary.segments[itinerary.segments.length - 1];
  try {
    const found = mockSearch({
      itineraries: [{ origin: first.departure.iataCode, destination: last.arrival.iataCode, departureDate: toAirportLocalIso(first.departure.at, first.departure.iataCode).slice(0, 10) }],
      passengers: { adults: counts.ADULT || 1, youths: counts.YOUTH ?? 0, children: counts.CHILD ?? 0, infants: counts.INFANT ?? 0 },
    });
    const same = found.offers.flatMap((o) => o.itineraries).find((it) => it.segments.map((s) => s.flightNumber).join() === itinerary.segments.map((s) => s.flightNumber).join());
    return same ? itineraryCents(same, brand, cabin, counts) : null;
  } catch {
    return null; // la fecha original ya pasó: sin referencia no hay diferencia
  }
}

function passengerCounts(dto: BookingDetailDto): Record<string, number> {
  const counts: Record<string, number> = { ADULT: 0, YOUTH: 0, CHILD: 0, INFANT: 0 };
  for (const p of dto.passengers ?? []) counts[p.passengerType] += 1;
  return counts;
}

/**
 * POST /bookings/{id}/date-change/search. Solo si la familia permite cambios (409 FARE_NOT_CHANGEABLE) y el vuelo no
 * salió (409 FLIGHT_ALREADY_DEPARTED) ni sale en menos de 2 horas (409 CUTOFF_PASSED). Devuelve hasta 4 vuelos de la nueva
 * fecha, con la diferencia de precio (fareDifference + taxDifference + changeFee = totalToPay; negativo = reembolso).
 */
export function searchDateChange(db: MockDb, stored: StoredBooking, ownerId: string, body: DateChangeSearchRequestDto, now: number): DateChangeOptionDto[] {
  requireConfirmed(stored);
  const { dto } = stored;
  if (!body.changes?.length) throw problem(400, 'VALIDATION_FAILED', 'changes: must contain at least 1 element', 'changes', 'must contain at least 1 element');
  const change = body.changes[0];
  const index = (dto.itineraries ?? []).findIndex((it) => it.itineraryId === change.itineraryId);
  if (index < 0) throw problem(422, 'VALIDATION_FAILED', 'changes[0].itineraryId: is not an itinerary of this booking', 'changes[0].itineraryId', 'not an itinerary of this booking');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(change.newDepartureDate)) throw problem(400, 'VALIDATION_FAILED', 'changes[0].newDepartureDate: must be a date', 'changes[0].newDepartureDate', 'must be a date');
  const current = dto.itineraries![index];
  const option = current.pricingOptions[0];
  if (!option?.fareRules.isChangeable) throw problem(409, 'FARE_NOT_CHANGEABLE', `The fare ${option?.fareBrand ?? ''} does not allow date changes`);
  const departure = new Date(current.segments[0].departure.at).getTime();
  if (departure <= now) throw problem(409, 'FLIGHT_ALREADY_DEPARTED', 'The flight has already departed');
  if (departure - now < 2 * 3_600_000) throw problem(409, 'CUTOFF_PASSED', 'Date changes close 2 hours before departure');

  const counts = passengerCounts(dto);
  const first = current.segments[0];
  const last = current.segments[current.segments.length - 1];
  // Una fecha pasada responde 400 y una fuera de la ventana de venta, sin ofertas (como la búsqueda).
  const results = mockSearch(
    {
      itineraries: [{ origin: first.departure.iataCode, destination: last.arrival.iataCode, departureDate: change.newDepartureDate }],
      passengers: { adults: counts.ADULT || 1, youths: counts.YOUTH, children: counts.CHILD, infants: counts.INFANT },
    },
    now,
  );
  const paid = paidCents(current, option.fareBrand, option.cabinClass, counts);
  const payingSeats = seated(dto).length;
  db.changeOffers = db.changeOffers.filter((o) => new Date(o.expiresAt).getTime() > now);

  return results.offers
    .flatMap((o) => o.itineraries)
    .filter((it) => it.pricingOptions.some((p) => p.fareBrand === option.fareBrand && p.cabinClass === option.cabinClass))
    .slice(0, 4)
    .map((it): DateChangeOptionDto => {
      const next = itineraryCents(it, option.fareBrand, option.cabinClass, counts) ?? [0, 0];
      const [paidBase, paidTaxes] = paid ?? next;
      const fareDiff = next[0] - paidBase;
      const taxDiff = next[1] - paidTaxes;
      const fee = (CHANGE_FEE_USD[option.fareBrand] ?? 0) * 100 * payingSeats;
      const total = fareDiff + taxDiff + fee;
      const offer: StoredChangeOffer = {
        id: crypto.randomUUID(),
        bookingId: dto.bookingId,
        ownerId,
        replacesItineraryId: current.itineraryId,
        itinerary: { ...it, pricingOptions: [{ ...(it.pricingOptions.find((p) => p.fareBrand === option.fareBrand && p.cabinClass === option.cabinClass) ?? option), pricePerPassengerType: [] }] },
        expiresAt: iso(now + CHANGE_OFFER_MINUTES * 60_000),
        totalCents: total,
      };
      db.changeOffers.push(offer);
      return {
        changeOfferId: offer.id,
        expiresAt: offer.expiresAt,
        segments: it.segments,
        priceDifference: { fareDifference: usd(fareDiff), taxDifference: usd(taxDiff), changeFee: usd(fee), totalToPay: usd(total) },
      };
    });
}

/** Pone el itinerario nuevo en la reserva: reasigna asientos (primer libre) y pasa maletas y boletos al itinerario nuevo. */
function applyDateChange(db: MockDb, stored: StoredBooking, offer: StoredChangeOffer, now: number) {
  const { dto } = stored;
  const index = (dto.itineraries ?? []).findIndex((it) => it.itineraryId === offer.replacesItineraryId);
  if (index < 0) return;
  const old = dto.itineraries![index];
  const cabin = offer.itinerary.pricingOptions[0].cabinClass;
  dto.itineraries![index] = offer.itinerary;
  const reserved = new Map(offer.itinerary.segments.map((s) => [s.segmentId, new Set<string>()]));
  for (const p of dto.passengers ?? []) {
    if (p.passengerType === 'INFANT') continue;
    const kept = (p.assignedSeats ?? []).filter((a) => !old.segments.some((s) => s.segmentId === a.segmentId));
    const fresh = offer.itinerary.segments.map((s) => {
      // El id de un tramo del mock es <offerId>|<itinerario>|<tramo>: de ahí sale el mapa para asignar el primer asiento libre.
      const seatNumber = firstFreeSeat(db, s.segmentId.split('|')[0], s.segmentId, cabin, reserved.get(s.segmentId)!);
      reserved.get(s.segmentId)!.add(seatNumber);
      return { segmentId: s.segmentId, seatNumber };
    });
    p.assignedSeats = [...kept, ...fresh];
    p.extraBaggage = (p.extraBaggage ?? []).map((b) => (b.itineraryId === old.itineraryId ? { ...b, itineraryId: offer.itinerary.itineraryId } : b));
  }
  dto.tickets = (dto.tickets ?? []).map((t) => ({
    ...t,
    segments: [...(t.segments ?? []).filter((s) => !old.segments.some((o) => o.segmentId === s.segmentId)), ...offer.itinerary.segments.map((s) => ({ segmentId: s.segmentId, status: 'ISSUED' as const, couponNumber: null }))],
  }));
  dto.status = 'CONFIRMED';
  dto.updatedAt = iso(now);
  dto.changes = [...(dto.changes ?? []), { changedAt: iso(now), description: `Date changed: ${old.segments[0].flightNumber} → ${offer.itinerary.segments[0].flightNumber}` }];
  stored.checkedIn = false;
  db.changeOffers = db.changeOffers.filter((o) => o.id !== offer.id);
}

/**
 * POST /bookings/{id}/date-change. 200 con la reserva actualizada; con PAY-PEND- 202 (CHANGE_PENDING, se aplica a los 20 s);
 * oferta vencida 410 CHANGE_OFFER_EXPIRED; si hay algo que pagar, la referencia es obligatoria.
 */
export function confirmDateChange(
  db: MockDb,
  stored: StoredBooking,
  ownerId: string,
  body: DateChangeRequestDto,
  key: string,
  now: number,
): { outcome: 'done'; data: BookingDetailDto } | { outcome: 'pending' } {
  checkKey(key);
  const replayed = replayOf(db, 'date-change', ownerId, key, body);
  if (replayed) return replayed.outcome === 'pending' ? { outcome: 'pending' } : { outcome: 'done', data: stored.dto };
  requireConfirmed(stored);
  const offer = db.changeOffers.find((o) => o.id === body.changeOfferId && o.bookingId === stored.dto.bookingId && o.ownerId === ownerId);
  if (!offer) throw problem(422, 'VALIDATION_FAILED', 'changeOfferId: is not an offer of this booking', 'changeOfferId', 'not an offer of this booking');
  if (new Date(offer.expiresAt).getTime() <= now) throw new ApiError({ status: 410, code: 'CHANGE_OFFER_EXPIRED', detail: 'The change offer has expired' });
  let outcome: 'OK' | 'PEND' = 'OK';
  // Sin nada que pagar (o con reembolso) no hace falta pago; si lo mandan, igual se valida.
  if (offer.totalCents > 0 || body.payment) outcome = charge(db, body.payment, 'payment');
  if (outcome === 'PEND') {
    stored.dto.status = 'CHANGE_PENDING';
    stored.pending = { kind: 'date-change', applyAfter: iso(now + PENDING_ISSUE_MS), offerId: offer.id };
    remember(db, 'date-change', ownerId, key, body, stored.dto.bookingId, 'pending');
    return { outcome: 'pending' };
  }
  applyDateChange(db, stored, offer, now);
  remember(db, 'date-change', ownerId, key, body, stored.dto.bookingId, 'done');
  return { outcome: 'done', data: stored.dto };
}

/* ------------------------------------------ cancelación ------------------------------------------ */

/**
 * GET /bookings/{id}/cancellation-quote. Con tarifa reembolsable se devuelve el total menos el 10 % de penalidad;
 * sin ella, nada de reembolso y la penalidad es el total (DISCREPANCIA: las reglas de reembolso son del mock).
 */
export function cancellationQuote(db: MockDb, stored: StoredBooking, ownerId: string, now: number): CancellationQuoteDto {
  requireConfirmed(stored);
  const { dto } = stored;
  const total = parseMoney(dto.grandTotal.total, dto.grandTotal.currency);
  const refundable = dto.itineraries?.every((it) => it.pricingOptions[0]?.fareRules.isRefundable) ?? false;
  const penalty: Money = refundable ? { cents: Math.round(total.cents * CANCEL_PENALTY_RATE), currency: total.currency } : total;
  const refund: Money = refundable ? { cents: total.cents - penalty.cents, currency: total.currency } : zeroMoney(total.currency);
  const quote = {
    id: crypto.randomUUID(),
    bookingId: dto.bookingId,
    ownerId,
    refund: toDecimalString(refund),
    penalty: toDecimalString(penalty),
    currency: total.currency,
    refundable,
    expiresAt: iso(now + QUOTE_MINUTES * 60_000),
  };
  db.quotes = db.quotes.filter((q) => new Date(q.expiresAt).getTime() > now);
  db.quotes.push(quote);
  return { quoteId: quote.id, isRefundable: refundable, refundAmount: quote.refund, penaltyAmount: quote.penalty, currency: quote.currency, expiresAt: quote.expiresAt };
}

/** POST /bookings/{id}/cancel. 200 cancelada; 202 en proceso (solo la reserva de demostración con `slowCancel`); 409 si ya estaba cancelada o la cotización venció. */
export function cancelBooking(db: MockDb, stored: StoredBooking, ownerId: string, body: CancelBookingRequestDto, key: string, now: number): 'done' | 'pending' {
  checkKey(key);
  const replayed = replayOf(db, 'cancel', ownerId, key, body);
  if (replayed) return replayed.outcome ?? 'done';
  if (stored.dto.status === 'CANCELLED') throw problem(409, 'ALREADY_CANCELLED', 'The booking is already cancelled');
  requireConfirmed(stored);
  const quote = db.quotes.find((q) => q.id === body.quoteId && q.bookingId === stored.dto.bookingId && q.ownerId === ownerId);
  if (!quote) throw problem(422, 'VALIDATION_FAILED', 'quoteId: is not a quote of this booking', 'quoteId', 'not a quote of this booking');
  if (new Date(quote.expiresAt).getTime() <= now) throw problem(409, 'QUOTE_EXPIRED', 'The cancellation quote has expired');
  db.quotes = db.quotes.filter((q) => q.id !== quote.id);
  const { dto } = stored;
  if (stored.slowCancel) {
    dto.status = 'CANCELLATION_PENDING';
    stored.pending = { kind: 'cancel', applyAfter: iso(now + PENDING_ISSUE_MS) };
    remember(db, 'cancel', ownerId, key, body, dto.bookingId, 'pending');
    return 'pending';
  }
  dto.status = 'CANCELLED';
  dto.updatedAt = iso(now);
  dto.changes = [...(dto.changes ?? []), { changedAt: iso(now), description: `Booking cancelled; refund ${quote.refund} ${quote.currency}` }];
  remember(db, 'cancel', ownerId, key, body, dto.bookingId, 'done');
  return 'done';
}

/* -------------------------------------- procesos asíncronos -------------------------------------- */

/** El proceso asíncrono del GDS: aplica lo aceptado con 202 cuando ya maduró (al consultar la reserva). */
export function settlePending(db: MockDb, stored: StoredBooking, now: number): StoredBooking {
  const pending = stored.pending;
  if (!pending || now < new Date(pending.applyAfter).getTime()) return stored;
  delete stored.pending;
  const { dto } = stored;
  if (pending.kind === 'baggage') {
    applyBaggage(dto, pending.passengerId, pending.itineraryId, pending.quantity);
    dto.updatedAt = iso(now);
    dto.changes = [...(dto.changes ?? []), { changedAt: iso(now), description: `${pending.quantity} extra bag(s) added for ${pending.passengerId}` }];
  } else if (pending.kind === 'date-change') {
    const offer = db.changeOffers.find((o) => o.id === pending.offerId);
    if (offer) applyDateChange(db, stored, offer, now);
    else dto.status = 'CONFIRMED';
  } else {
    dto.status = 'CANCELLED';
    dto.updatedAt = iso(now);
    dto.changes = [...(dto.changes ?? []), { changedAt: iso(now), description: 'Booking cancelled' }];
  }
  return stored;
}
