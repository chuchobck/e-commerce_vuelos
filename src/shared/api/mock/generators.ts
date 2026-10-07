import { ApiError } from '../errors';
import type {
  Cabin,
  Fare,
  FlightOffer,
  FlightSegment,
  FlightStatus,
  FlightStatusCode,
  PassengerCount,
  Seat,
  SeatMap,
} from '../types';
import { findAirport, UTC_OFFSET_MINUTES } from './data/airports';
import {
  CABIN_MULTIPLIER,
  CHILD_RATIO,
  FARE_RULES,
  GALAPAGOS_SURCHARGE,
  INFANT_MIN,
  INFANT_RATIO,
} from './data/fares';
import { AIRCRAFT_BY_KM, DIRECTED_ROUTES, HUBS } from './data/routes';
import { distanceKm, localToUtcMs, randomInt, round2, seeded, toZonedIso } from './random';

const GALAPAGOS = ['GPS', 'SCY'];
const MIN_CONNECTION_MIN = 50;

function routeIndex(origin: string, destination: string) {
  return DIRECTED_ROUTES.findIndex(([a, b]) => a === origin && b === destination);
}

function routeKm(origin: string, destination: string) {
  const a = findAirport(origin);
  const b = findAirport(destination);
  if (!a || !b) throw new ApiError(422, 'VALIDATION', 'Aeropuerto desconocido');
  return distanceKm(a.lat, a.lon, b.lat, b.lon);
}

function offsetOf(code: string) {
  const airport = findAirport(code);
  return airport ? UTC_OFFSET_MINUTES[airport.timeZone] : -300;
}

/** Vuelos directos de una ruta en una fecha (deterministas). */
export function directSegments(origin: string, destination: string, date: string): FlightSegment[] {
  const r = routeIndex(origin, destination);
  if (r < 0) return [];
  const rand = seeded(`${origin}-${destination}-${date}`);
  const km = routeKm(origin, destination);
  const duration = Math.round(km / 9 + 25);
  const isIsland = GALAPAGOS.includes(origin) || GALAPAGOS.includes(destination);
  const trunk = (origin === 'UIO' && destination === 'GYE') || (origin === 'GYE' && destination === 'UIO');
  const count = trunk ? randomInt(rand, 5, 7) : isIsland ? randomInt(rand, 2, 3) : randomInt(rand, 2, 4);
  const start = isIsland ? 6 * 60 + 30 : 6 * 60;
  const end = isIsland ? 13 * 60 : 20 * 60 + 30;
  const step = (end - start) / count;
  const originOffset = offsetOf(origin);
  const destOffset = offsetOf(destination);

  return Array.from({ length: count }, (_, slot) => {
    const minute = Math.round((start + slot * step + rand() * (step * 0.6)) / 5) * 5;
    const depUtc = localToUtcMs(date, minute, originOffset);
    const arrUtc = depUtc + duration * 60_000;
    return {
      flightNumber: `QD${100 + r * 10 + slot}`,
      origin,
      destination,
      departureTime: toZonedIso(depUtc, originOffset),
      arrivalTime: toZonedIso(arrUtc, destOffset),
      durationMinutes: duration,
      aircraft: AIRCRAFT_BY_KM(km),
    };
  });
}

function basePrice(km: number, origin: string, destination: string, rand: () => number) {
  const island = GALAPAGOS.includes(origin) || GALAPAGOS.includes(destination);
  const base = 42 + km * 0.11 + (island ? GALAPAGOS_SURCHARGE : 0);
  return base * (0.9 + rand() * 0.35);
}

function buildFares(offerId: string, km: number, segments: FlightSegment[], cabin: Cabin, pax: PassengerCount): Fare[] {
  const first = segments[0];
  const last = segments[segments.length - 1];
  const rand = seeded(`${offerId}-price`);
  const base = basePrice(km, first.origin, last.destination, rand) * CABIN_MULTIPLIER[cabin];
  const seatsBase = randomInt(rand, 2, 24);

  return FARE_RULES.map((rule, i) => {
    const adult = round2(Math.floor(base * rule.multiplier) + 0.9);
    const child = round2(adult * CHILD_RATIO);
    const infant = round2(Math.max(INFANT_MIN, adult * INFANT_RATIO));
    const total = round2(adult * pax.adults + child * pax.children + infant * pax.infants);
    return {
      id: `${offerId}~${rule.family}`,
      family: rule.family,
      cabin,
      pricePerAdult: adult,
      totalPrice: total,
      currency: 'USD',
      baggage: rule.baggage,
      changeable: rule.changeable,
      changeFee: rule.changeFee,
      refundable: rule.refundable,
      seatSelectionIncluded: rule.seatSelectionIncluded,
      seatsLeft: Math.max(1, seatsBase - i * 3),
    } satisfies Fare;
  });
}

function minutesBetween(aIso: string, bIso: string) {
  return Math.round((new Date(bIso).getTime() - new Date(aIso).getTime()) / 60_000);
}

/**
 * Identificador de oferta reversible: permite regenerar la oferta sin servidor.
 * Formato: OF~ORIG~DEST~FECHA~CABINA~QDxxx[.QDyyy]
 */
function offerId(origin: string, destination: string, date: string, cabin: Cabin, segments: FlightSegment[]) {
  return ['OF', origin, destination, date, cabin, segments.map((s) => s.flightNumber).join('.')].join('~');
}

function toOffer(origin: string, destination: string, date: string, cabin: Cabin, pax: PassengerCount, segments: FlightSegment[]): FlightOffer {
  const id = offerId(origin, destination, date, cabin, segments);
  const km = routeKm(origin, destination);
  return {
    id,
    segments,
    durationMinutes: minutesBetween(segments[0].departureTime, segments[segments.length - 1].arrivalTime),
    stops: segments.length - 1,
    fares: buildFares(id, km, segments, cabin, pax),
  };
}

/** Ofertas directas y con 1 escala (vía UIO o GYE) ordenadas por hora de salida. */
export function generateOffers(origin: string, destination: string, date: string, cabin: Cabin, pax: PassengerCount): FlightOffer[] {
  const direct = directSegments(origin, destination, date).map((s) =>
    toOffer(origin, destination, date, cabin, pax, [s]),
  );

  const connecting: FlightOffer[] = [];
  if (direct.length === 0) {
    for (const hub of HUBS) {
      if (hub === origin || hub === destination) continue;
      const first = directSegments(origin, hub, date);
      const second = directSegments(hub, destination, date);
      for (const a of first) {
        const b = second.find((s) => minutesBetween(a.arrivalTime, s.departureTime) >= MIN_CONNECTION_MIN);
        if (b) connecting.push(toOffer(origin, destination, date, cabin, pax, [a, b]));
      }
    }
  }

  return [...direct, ...connecting]
    .sort((x, y) => x.segments[0].departureTime.localeCompare(y.segments[0].departureTime))
    .slice(0, 8);
}

/** Reconstruye una oferta a partir de su id (para holds y reservas). */
export function offerFromId(id: string, pax: PassengerCount): FlightOffer | null {
  const [prefix, origin, destination, date, cabin, numbers] = id.split('~');
  if (prefix !== 'OF' || !numbers) return null;
  const offers = generateOffers(origin, destination, date, cabin as Cabin, pax);
  return offers.find((o) => o.id === id) ?? null;
}

/** Mapa de asientos determinista por vuelo y fecha. */
export function generateSeatMap(flightNumber: string, date: string): SeatMap {
  const rand = seeded(`${flightNumber}-${date}-seats`);
  const aircraft = findSegment(flightNumber, date)?.aircraft ?? 'Airbus A320';
  const atr = aircraft.startsWith('ATR');
  const columns = atr ? ['A', 'C', 'D', 'F'] : ['A', 'B', 'C', 'D', 'E', 'F'];
  const rowsCount = atr ? 18 : 30;
  const exitRows = [12, 13];

  const rows = Array.from({ length: rowsCount }, (_, i) => {
    const number = i + 1;
    const seats: Seat[] = columns.map((letter, c) => {
      const kind = number <= 4 ? 'EXTRA_LEGROOM' : exitRows.includes(number) ? 'EXIT_ROW' : 'STANDARD';
      const roll = rand();
      return {
        id: `${number}${letter}`,
        row: number,
        letter,
        status: roll < 0.38 ? 'OCCUPIED' : roll < 0.41 ? 'BLOCKED' : 'AVAILABLE',
        kind,
        price: kind === 'EXTRA_LEGROOM' ? 18 : kind === 'EXIT_ROW' ? 12 : 6,
        window: c === 0 || c === columns.length - 1,
        aisle: columns.length === 6 ? c === 2 || c === 3 : c === 1 || c === 2,
      };
    });
    return { number, seats };
  });

  return { flightNumber, aircraft, columns, aisleAfter: [columns.length / 2 - 1], rows };
}

/** Busca un vuelo por número y fecha recorriendo la numeración de rutas. */
export function findSegment(flightNumber: string, date: string): FlightSegment | null {
  const n = Number(flightNumber.replace(/^QD/i, ''));
  if (!Number.isFinite(n) || n < 100) return null;
  const r = Math.floor((n - 100) / 10);
  const route = DIRECTED_ROUTES[r];
  if (!route) return null;
  return directSegments(route[0], route[1], date).find((s) => s.flightNumber === `QD${n}`) ?? null;
}

/** Estado de vuelo coherente con la hora actual. */
export function generateFlightStatus(segment: FlightSegment, date: string, now = Date.now()): FlightStatus {
  const rand = seeded(`${segment.flightNumber}-${date}-status`);
  const dep = new Date(segment.departureTime).getTime();
  const arr = new Date(segment.arrivalTime).getTime();
  const roll = rand();
  const cancelled = roll < 0.03;
  const delayMin = roll < 0.18 ? randomInt(rand, 5, 18) * 5 : 0;
  const estDep = dep + delayMin * 60_000;
  const estArr = arr + delayMin * 60_000;
  const originOffset = offsetOf(segment.origin);
  const destOffset = offsetOf(segment.destination);

  let status: FlightStatusCode;
  if (cancelled) status = 'CANCELLED';
  else if (now >= estArr) status = 'LANDED';
  else if (now >= estDep) status = 'DEPARTED';
  else if (now >= estDep - 40 * 60_000) status = 'BOARDING';
  else if (estDep - now > 24 * 3_600_000) status = 'SCHEDULED';
  else status = delayMin > 0 ? 'DELAYED' : 'ON_TIME';

  return {
    flightNumber: segment.flightNumber,
    date,
    origin: segment.origin,
    destination: segment.destination,
    status,
    scheduledDeparture: segment.departureTime,
    estimatedDeparture: toZonedIso(estDep, originOffset),
    scheduledArrival: segment.arrivalTime,
    estimatedArrival: toZonedIso(estArr, destOffset),
    gate: status === 'CANCELLED' ? null : `${randomInt(rand, 1, 14)}`,
    updatedAt: new Date(now).toISOString(),
  };
}
