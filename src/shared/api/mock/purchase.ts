/**
 * Hold y reserva del mock con las reglas de la API real (README, sección 6, "Hold y reserva"):
 * Idempotency-Key por usuario (misma clave y mismo cuerpo = misma respuesta; cuerpo distinto = 422),
 * cupo apartado 15 minutos, pago simulado por el prefijo de la referencia y emisión asíncrona del
 * pago pendiente. Trabaja sobre la forma del contrato; MockFlightsApi la mapea igual que la API real.
 */
import { isBookableCountry } from '@/shared/lib/countries';
import { isValidCedula } from '@/shared/lib/validators';
import { addMoney, toDecimalString } from '@/shared/lib/money';
import { stableHash } from '@/shared/lib/stableHash';
import type { BookingDetailDto, BookingRequestDto, HoldRequestDto, HoldResponseDto, HoldStatusDto, PassengerItemDto, TicketDto } from '../contract';
import { ApiError } from '../errors';
import { mapOffer } from '../mapping';
import { HOLD_MINUTES } from './data/fares';
import { mockOfferFromId, mockSeatMap } from './generators';
import { randomCode } from './random';
import type { MockDb, StoredBooking, StoredHold } from './store';

/** Como en la API: una reserva PAY-PEND- se confirma en la primera pasada del proceso de emisión. */
export const PENDING_ISSUE_MS = 20_000;
const PAYMENT_FORMAT = /^[A-Za-z0-9_.:-]{8,64}$/;
const SIMULATED_PAYMENT = /^PAY-(OK|PEND|REJ)-[A-Z0-9]{4,50}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const problem = (status: number, code: ApiError['code'], detail: string, field?: string, reason?: string) =>
  new ApiError({ status, code, detail, fieldErrors: field ? [{ field, message: reason ?? detail }] : [] });

function checkKey(key: string) {
  if (!key) throw problem(400, 'VALIDATION_FAILED', 'Idempotency-Key: is required', 'Idempotency-Key', 'is required');
  if (!UUID.test(key)) throw problem(400, 'VALIDATION_FAILED', 'Idempotency-Key: must be a UUID', 'Idempotency-Key', 'must be a UUID');
}

/** La clave ya usada por este usuario: misma huella = repetición; otra huella = 422. */
function replayOf(db: MockDb, scope: 'hold' | 'booking', ownerId: string, key: string, body: unknown): string | null {
  const found = db.idempotency.find((k) => k.scope === scope && k.ownerId === ownerId && k.key === key);
  if (!found) return null;
  if (found.bodyHash !== stableHash(body)) {
    throw problem(422, 'VALIDATION_FAILED', 'This Idempotency-Key was already used with a different request body', 'Idempotency-Key', 'already used with another body');
  }
  return found.resultId;
}

/** Vence en el momento de consultarlo, como el vencimiento perezoso de la API. */
function settle(hold: StoredHold, now: number): StoredHold {
  if (hold.status === 'HELD' && new Date(hold.expiresAt).getTime() <= now) hold.status = 'EXPIRED';
  return hold;
}

function holdResponse(hold: StoredHold): HoldResponseDto {
  return { holdId: hold.id, status: 'HELD', expiresAt: hold.expiresAt, ttlMinutes: HOLD_MINUTES, lockedPrice: hold.lockedPrice };
}

export function createHold(db: MockDb, ownerId: string, body: HoldRequestDto, key: string, now: number): HoldResponseDto {
  checkKey(key);
  const replayed = replayOf(db, 'hold', ownerId, key, body);
  if (replayed) return holdResponse(db.holds.find((h) => h.id === replayed)!);

  const dto = mockOfferFromId(body.offerId);
  if (!dto) throw problem(409, 'OFFER_NO_LONGER_AVAILABLE', `Offer ${body.offerId} was not found or has expired`);
  const p = body.passengersBreakdown;
  const offer = mapOffer(dto, { adults: p.adults ?? 0, children: p.children ?? 0, infants: p.infants ?? 0 });
  if (body.itinerarySelections.length !== offer.itineraries.length) {
    throw problem(422, 'VALIDATION_FAILED', 'itinerarySelections: one selection per itinerary of the offer is required', 'itinerarySelections', 'missing itineraries');
  }
  const totals = body.itinerarySelections.map((sel, i) => {
    const itinerary = offer.itineraries.find((it) => it.id === sel.itineraryId);
    if (!itinerary) throw problem(422, 'VALIDATION_FAILED', `itinerarySelections[${i}].itineraryId: is not an itinerary of the offer`, `itinerarySelections[${i}].itineraryId`, 'is not an itinerary of the offer');
    const fare = itinerary.fares.find((f) => f.cabin === sel.cabinClass && f.brand === sel.fareBrand);
    if (!fare) throw problem(409, 'OFFER_NO_LONGER_AVAILABLE', 'The fare is no longer sold or there are not enough seats');
    return fare.total;
  });
  const total = totals.reduce(addMoney);
  const hold: StoredHold = {
    id: crypto.randomUUID(),
    ownerId,
    status: 'HELD',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + HOLD_MINUTES * 60_000).toISOString(),
    request: body,
    lockedPrice: { currency: total.currency, total: toDecimalString(total) },
  };
  db.holds.push(hold);
  db.idempotency.push({ scope: 'hold', ownerId, key, bodyHash: stableHash(body), resultId: hold.id });
  return holdResponse(hold);
}

function ownedHold(db: MockDb, ownerId: string, holdId: string): StoredHold {
  const hold = db.holds.find((h) => h.id === holdId && h.ownerId === ownerId);
  if (!hold) throw problem(404, 'VALIDATION_FAILED', `Hold ${holdId} was not found`);
  return hold;
}

export function getHold(db: MockDb, ownerId: string, holdId: string, now: number): HoldStatusDto {
  const hold = settle(ownedHold(db, ownerId, holdId), now);
  const remaining = hold.status === 'HELD' ? Math.max(0, Math.floor((new Date(hold.expiresAt).getTime() - now) / 1000)) : 0;
  return { status: hold.status, expiresAt: hold.expiresAt, remainingSeconds: remaining, lockedPrice: hold.lockedPrice };
}

export function releaseHold(db: MockDb, ownerId: string, holdId: string, now: number): void {
  const hold = settle(ownedHold(db, ownerId, holdId), now);
  if (hold.status === 'CONSUMED') {
    throw problem(409, 'VALIDATION_FAILED', `Hold ${holdId} was already used for a booking; cancel the booking instead`);
  }
  if (hold.status === 'HELD') hold.status = 'RELEASED';
}

/** Años cumplidos en `on` (fechas yyyy-MM-dd). */
function ageOn(birth: string, on: string): number {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [y, m, d] = on.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

const AGE_TYPE = (age: number) => (age < 2 ? 'INFANT' : age < 12 ? 'CHILD' : age < 18 ? 'YOUTH' : 'ADULT');

/** Las validaciones de pasajeros de la API que importan a la compra (400 propias, 422 contra el hold). */
function checkPassengers(passengers: PassengerItemDto[], hold: StoredHold, firstDeparture: string) {
  const breakdown = hold.request.passengersBreakdown;
  const expected = { ADULT: breakdown.adults ?? 0, YOUTH: breakdown.youths ?? 0, CHILD: breakdown.children ?? 0, INFANT: breakdown.infants ?? 0 };
  for (const type of Object.keys(expected) as (keyof typeof expected)[]) {
    const sent = passengers.filter((p) => p.passengerType === type).length;
    if (sent !== expected[type]) {
      throw problem(422, 'VALIDATION_FAILED', `passengers: the hold is for ${expected[type]} ${type} passenger(s), not ${sent}`, 'passengers', 'count');
    }
  }
  const adults = new Set(passengers.filter((p) => p.passengerType === 'ADULT').map((p) => p.passengerId));
  passengers.forEach((p, i) => {
    const field = `passengers[${i}]`;
    if (p.passengerType === 'INFANT' && (!p.associatedAdultId || !adults.has(p.associatedAdultId))) {
      throw problem(400, 'VALIDATION_FAILED', `${field}.associatedAdultId: must be the passengerId of an ADULT of this booking`, `${field}.associatedAdultId`, 'adult');
    }
    if (p.documentType === 'NATIONAL_ID' && p.nationality === 'EC' && !isValidCedula(p.documentNumber)) {
      throw problem(400, 'VALIDATION_FAILED', `${field}.documentNumber: is not a valid Ecuadorian national ID`, `${field}.documentNumber`, 'is not a valid Ecuadorian national ID');
    }
    if (!isBookableCountry(p.nationality)) {
      throw problem(422, 'VALIDATION_FAILED', `${field}.nationality: is not a country this API knows`, `${field}.nationality`, 'is not a country this API knows');
    }
    if (p.documentType === 'PASSPORT' && !p.documentExpiryDate) {
      throw problem(400, 'VALIDATION_FAILED', `${field}.documentExpiryDate: is required for a PASSPORT`, `${field}.documentExpiryDate`, 'is required for a PASSPORT');
    }
    if (AGE_TYPE(ageOn(p.birthDate, firstDeparture)) !== p.passengerType) {
      throw problem(422, 'VALIDATION_FAILED', `${field}.birthDate: does not match passengerType ${p.passengerType}`, `${field}.birthDate`, 'does not match passengerType');
    }
  });
}

function issueTickets(booking: BookingDetailDto, now: number) {
  booking.tickets = (booking.tickets ?? []).map((t, i) => ({
    ...t,
    status: 'ISSUED',
    eTicketNumber: `045${String(Math.floor((now + i) % 1e10)).padStart(10, '0')}`,
    issuedAt: new Date(now).toISOString(),
    segments: (t.segments ?? []).map((s, i) => ({ ...s, status: 'ISSUED', couponNumber: String(i + 1) })),
  }));
  booking.status = 'CONFIRMED';
  booking.updatedAt = new Date(now).toISOString();
  booking.changes = [
    ...(booking.changes ?? []),
    { changedAt: new Date(now).toISOString(), description: `${booking.tickets.length} ticket(s) issued` },
    { changedAt: new Date(now).toISOString(), description: 'Booking confirmed' },
  ];
}

/** El proceso de emisión de la API: confirma las reservas con pago pendiente que ya maduraron. */
export function settleBooking(stored: StoredBooking, now: number): StoredBooking {
  if (stored.dto.status === 'PENDING_PAYMENT' && stored.issueAfter && now >= new Date(stored.issueAfter).getTime()) {
    issueTickets(stored.dto, now);
    delete stored.issueAfter;
  }
  return stored;
}

export function createBooking(db: MockDb, ownerId: string, body: BookingRequestDto, key: string, now: number): BookingDetailDto {
  checkKey(key);
  const replayed = replayOf(db, 'booking', ownerId, key, body);
  if (replayed) return settleBooking(db.bookings.find((b) => b.dto.bookingId === replayed)!, now).dto;

  const hold = db.holds.find((h) => h.id === body.holdId && h.ownerId === ownerId);
  if (!hold) throw problem(422, 'VALIDATION_FAILED', 'holdId: the hold was not found', 'holdId', 'the hold was not found');
  settle(hold, now);
  if (hold.status === 'EXPIRED' || hold.status === 'RELEASED') {
    throw new ApiError({ status: 410, code: 'OFFER_NO_LONGER_AVAILABLE', detail: `Hold ${hold.id} has expired or was released` });
  }
  if (hold.status === 'CONSUMED') throw problem(409, 'OFFER_NO_LONGER_AVAILABLE', `Hold ${hold.id} was already used for a booking`);

  const offer = mockOfferFromId(hold.request.offerId);
  if (!offer) throw problem(409, 'OFFER_NO_LONGER_AVAILABLE', 'The flights of this hold are no longer sold');
  const itineraries = hold.request.itinerarySelections.map((sel) => {
    const it = offer.itineraries.find((i) => i.itineraryId === sel.itineraryId)!;
    const fare = it.pricingOptions.find((p) => p.cabinClass === sel.cabinClass && p.fareBrand === sel.fareBrand)!;
    return { ...it, pricingOptions: [{ ...fare, pricePerPassengerType: [] }] };
  });
  checkPassengers(body.passengers, hold, itineraries[0].segments[0].departure.at.slice(0, 10));

  const reference = body.payment.paymentReference;
  if (!PAYMENT_FORMAT.test(reference)) {
    throw problem(400, 'VALIDATION_FAILED', 'payment.paymentReference: must be 8 to 64 letters, digits or _ . : -', 'payment.paymentReference', 'format');
  }
  if (db.paymentReferences.includes(reference)) {
    throw problem(409, 'PAYMENT_REFERENCE_INVALID', 'payment.paymentReference: was already used for another operation');
  }
  const outcome = SIMULATED_PAYMENT.exec(reference)?.[1];
  if (!outcome) throw problem(422, 'PAYMENT_REFERENCE_INVALID', 'payment.paymentReference: is not a payment of the Payment API', 'payment.paymentReference', 'unknown payment');
  // Rechazado: no queda nada y el hold sigue retenido.
  if (outcome === 'REJ') throw problem(422, 'PAYMENT_NOT_AUTHORIZED', 'The payment was not authorized by the Payment API');

  const bookingId = crypto.randomUUID();
  const segments = itineraries.flatMap((it) => it.segments);
  const passengers: PassengerItemDto[] = body.passengers.map((p, i) => {
    if (p.passengerType === 'INFANT') return { ...p, assignedSeats: [], extraBaggage: [] };
    const seats = segments.map((s) => {
      const chosen = p.assignedSeats?.find((a) => a.segmentId === s.segmentId);
      if (chosen) return chosen;
      const free = (mockSeatMap(hold.request.offerId, s.segmentId).cabins ?? [])
        .flatMap((c) => c.rows ?? [])
        .flatMap((r) => r.seats ?? [])
        .filter((seat) => seat.isAvailable);
      return { segmentId: s.segmentId, seatNumber: free[i]?.seatNumber ?? `${14 + i}C` };
    });
    return { ...p, assignedSeats: seats, extraBaggage: [] };
  });
  const tickets: TicketDto[] = passengers.map((p) => ({
    ticketId: crypto.randomUUID(),
    bookingId,
    passengerId: p.passengerId,
    eTicketNumber: null,
    status: 'PENDING',
    issuedAt: null,
    segments: segments.map((s) => ({ segmentId: s.segmentId, status: 'PENDING', couponNumber: null })),
  }));
  const at = new Date(now).toISOString();
  const dto: BookingDetailDto = {
    bookingId,
    pnr: randomCode(),
    status: 'PENDING_PAYMENT',
    grandTotal: hold.lockedPrice,
    createdAt: at,
    updatedAt: at,
    itineraries,
    passengers,
    tickets,
    changes: [
      { changedAt: at, description: 'Booking created from hold' },
      { changedAt: at, description: outcome === 'OK' ? 'Payment approved; issuing tickets' : 'Payment pending' },
    ],
  };
  const stored: StoredBooking = { dto, ownerId, checkedIn: false };
  if (outcome === 'OK') issueTickets(dto, now);
  else stored.issueAfter = new Date(now + PENDING_ISSUE_MS).toISOString();

  hold.status = 'CONSUMED';
  db.paymentReferences.push(reference);
  db.bookings.push(stored);
  db.idempotency.push({ scope: 'booking', ownerId, key, bodyHash: stableHash(body), resultId: bookingId });
  return dto;
}
