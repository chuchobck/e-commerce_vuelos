/**
 * Respuestas del mock con la forma EXACTA del contrato (tipos generados): horas en UTC, dinero
 * como texto, familias con sus códigos. La interfaz las recibe por las mismas funciones de mapeo
 * que las de la API real (../mapping.ts).
 */
import { toDecimalString } from '@/shared/lib/money';
import { airportOffsetMinutes, AIRPORTS } from '../airports';
import type {
  CabinPricingDto,
  FlightOfferDto,
  FlightStatusDto,
  ItineraryDto,
  MoneyDto,
  PassengerBreakdownDto,
  PassengerTypeDto,
  SearchRequestDto,
  SearchResponseDto,
  SeatMapDto,
  SegmentDto,
} from '../contract';
import { ApiError } from '../errors';
import {
  DEMAND_FACTOR,
  FAMILIES,
  MAX_CONNECTION_MIN,
  MAX_OFFERS,
  MIN_CONNECTION_MIN,
  PASSENGER_FACTOR,
  SCHEDULE_DAYS,
  TAX_RATE,
  WEEKEND_SURCHARGE,
  type MockFamily,
} from './data/fares';
import { AIRLINE_NAMES, CABIN_LAYOUT, ROUTES, type MockRoute } from './data/routes';
import { randomInt, seeded } from './random';

/** Un vuelo concreto: una ruta en una fecha local. */
interface Flight {
  route: MockRoute;
  /** Fecha local de salida (yyyy-MM-dd). */
  date: string;
  depUtc: number;
  arrUtc: number;
}

const flightNumberOf = (r: MockRoute) => `${r.airline}${r.number}`;

/** Fecha local de hoy en Ecuador continental (yyyy-MM-dd). */
function todayLocal(now = Date.now()): string {
  return new Date(now + airportOffsetMinutes('UIO') * 60_000).toISOString().slice(0, 10);
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Último día con salidas: la semilla genera 90 días desde su carga (aquí, desde hoy). */
function lastScheduledDate(now = Date.now()): string {
  return addDaysIso(todayLocal(now), SCHEDULE_DAYS - 1);
}

function isoWeekday(date: string): number {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function flightOn(route: MockRoute, date: string): Flight | null {
  if (!route.days.includes(isoWeekday(date))) return null;
  const [hh, mm] = route.departs.split(':').map(Number);
  const localMs = Date.parse(`${date}T00:00:00Z`) + (hh * 60 + mm) * 60_000;
  const depUtc = localMs - airportOffsetMinutes(route.origin) * 60_000;
  return { route, date, depUtc, arrUtc: depUtc + route.durationMin * 60_000 };
}

function flightsBetween(origin: string, destination: string, date: string): Flight[] {
  return ROUTES.filter((r) => r.origin === origin && r.destination === destination)
    .map((r) => flightOn(r, date))
    .filter((f): f is Flight => f !== null);
}

function findFlight(flightNumber: string, date: string): Flight | null {
  const route = ROUTES.find((r) => flightNumberOf(r) === flightNumber.toUpperCase());
  return route ? flightOn(route, date) : null;
}

/** Directos y con una escala de la misma aerolínea (conexión de 45 min a 6 h). */
function itinerariesFor(origin: string, destination: string, date: string, now: number): Flight[][] {
  const future = (f: Flight) => f.depUtc > now;
  const direct = flightsBetween(origin, destination, date).filter(future).map((f) => [f]);
  const connecting: Flight[][] = [];
  for (const hub of AIRPORTS.map((a) => a.code)) {
    if (hub === origin || hub === destination) continue;
    for (const first of flightsBetween(origin, hub, date).filter(future)) {
      for (const second of flightsBetween(hub, destination, date)) {
        const wait = (second.depUtc - first.arrUtc) / 60_000;
        if (second.route.airline === first.route.airline && wait >= MIN_CONNECTION_MIN && wait <= MAX_CONNECTION_MIN) {
          connecting.push([first, second]);
        }
      }
    }
  }
  return [...direct, ...connecting];
}

/* ------------------------------- precios (centavos enteros) ------------------------------- */

const PAX_TYPES: [PassengerTypeDto, keyof Required<PassengerBreakdownDto>][] = [
  ['ADULT', 'adults'],
  ['YOUTH', 'youths'],
  ['CHILD', 'children'],
  ['INFANT', 'infants'],
];

function cents(amount: number) {
  return Math.round(amount);
}

/** Tarifa base y tasas de un vuelo para una familia y un tipo de pasajero, en centavos. */
function flightPrice(flight: Flight, family: MockFamily, type: PassengerTypeDto) {
  const weekday = isoWeekday(flight.date);
  const weekend = weekday === 5 || weekday === 7 ? WEEKEND_SURCHARGE : 1;
  const base = cents(flight.route.baseUsd * 100 * family.factor * DEMAND_FACTOR * weekend * PASSENGER_FACTOR[type]);
  return { base, taxes: cents(base * TAX_RATE) };
}

function money(baseCents: number, taxesCents: number): MoneyDto {
  const usd = (c: number) => toDecimalString({ cents: c, currency: 'USD' });
  return { currency: 'USD', baseFare: usd(baseCents), taxes: usd(taxesCents), total: usd(baseCents + taxesCents) };
}

function seatsIn(aircraft: MockRoute['aircraft'], cabin: MockFamily['cabin']): number {
  return CABIN_LAYOUT[aircraft].filter((l) => l.cabin === cabin).reduce((n, l) => n + (l.to - l.from + 1) * l.letters.length, 0);
}

function pricing(flights: Flight[], family: MockFamily, pax: PassengerBreakdownDto): CabinPricingDto | null {
  const seats = Math.min(...flights.map((f) => seatsIn(f.route.aircraft, family.cabin)));
  if (seats <= 0) return null; // la familia debe existir en todos los vuelos del itinerario
  const types = PAX_TYPES.filter(([type, key]) => type === 'ADULT' || (pax[key] ?? 0) > 0);
  return {
    cabinClass: family.cabin,
    fareBrand: family.brand,
    availableSeats: seats,
    fareRules: { isRefundable: family.refundable, isChangeable: family.changeable },
    baggageAllowance: {
      personalItemIncluded: family.personalItem,
      carryOnIncluded: family.carryOn,
      checkedBaggageIncluded: family.checked,
    },
    extraCheckedBaggagePrice: {
      currency: 'USD',
      total: toDecimalString({ cents: flights.reduce((s, f) => s + f.route.extraBagUsd * 100, 0), currency: 'USD' }),
    },
    pricePerPassengerType: types.map(([type]) => {
      const parts = flights.map((f) => flightPrice(f, family, type));
      return {
        passengerType: type,
        price: money(
          parts.reduce((s, p) => s + p.base, 0),
          parts.reduce((s, p) => s + p.taxes, 0),
        ),
      };
    }),
  };
}

/** Total de una familia para todos los pasajeros, en centavos: [base, tasas]. */
function familyTotal(flights: Flight[], family: MockFamily, pax: PassengerBreakdownDto): [number, number] {
  let base = 0;
  let taxes = 0;
  for (const [type, key] of PAX_TYPES) {
    const count = pax[key] ?? 0;
    for (const f of flights) {
      const p = flightPrice(f, family, type);
      base += p.base * count;
      taxes += p.taxes * count;
    }
  }
  return [base, taxes];
}

/* ------------------------------------ ids reversibles ------------------------------------ */
// El mock no tiene servidor: los ids permiten reconstruir la oferta (para el hold y el mapa de asientos).
// offerId:     mock~a.y.c.i~2026-10-09:LA1400.LA2410[~2026-10-12:LA2411]
// itineraryId: <offerId>|<índice>    segmentId: <itineraryId>|<índice>

const itineraryKey = (flights: Flight[]) => `${flights[0].date}:${flights.map((f) => flightNumberOf(f.route)).join('.')}`;
const paxKey = (p: PassengerBreakdownDto) => [p.adults ?? 1, p.youths ?? 0, p.children ?? 0, p.infants ?? 0].join('.');

function flightsFromKey(key: string): Flight[] | null {
  const [date, numbers] = key.split(':');
  if (!date || !numbers) return null;
  const flights: Flight[] = [];
  for (const n of numbers.split('.')) {
    // Una escala sale el mismo día local que el primer vuelo.
    const f = findFlight(n, date);
    if (!f) return null;
    flights.push(f);
  }
  return flights;
}

function segmentDto(f: Flight, segmentId: string, previous?: Flight): SegmentDto {
  return {
    segmentId,
    flightNumber: flightNumberOf(f.route),
    departure: { iataCode: f.route.origin, at: new Date(f.depUtc).toISOString(), terminal: null },
    arrival: { iataCode: f.route.destination, at: new Date(f.arrUtc).toISOString(), terminal: null },
    ...(previous ? { layoverMinutes: Math.round((f.depUtc - previous.arrUtc) / 60_000) } : {}),
    marketingCarrier: f.route.airline,
    operatingCarrier: f.route.airline,
    aircraft: f.route.aircraft,
    durationMinutes: f.route.durationMin,
    status: 'SCHEDULED',
  };
}

function itineraryDto(flights: Flight[], itineraryId: string, pax: PassengerBreakdownDto): ItineraryDto {
  return {
    itineraryId,
    totalDurationMinutes: Math.round((flights[flights.length - 1].arrUtc - flights[0].depUtc) / 60_000),
    stopsCount: flights.length - 1,
    segments: flights.map((f, i) => segmentDto(f, `${itineraryId}|${i}`, flights[i - 1])),
    pricingOptions: FAMILIES.map((fam) => pricing(flights, fam, pax)).filter((p): p is CabinPricingDto => p !== null),
  };
}

function cheapest(flights: Flight[], pax: PassengerBreakdownDto): [number, number] {
  return FAMILIES.filter((fam) => flights.every((f) => seatsIn(f.route.aircraft, fam.cabin) > 0))
    .map((fam) => familyTotal(flights, fam, pax))
    .reduce((min, t) => (t[0] + t[1] < min[0] + min[1] ? t : min));
}

function offerDto(legs: Flight[][], pax: PassengerBreakdownDto): FlightOfferDto {
  const offerId = ['mock', paxKey(pax), ...legs.map(itineraryKey)].join('~');
  const airline = legs[0][0].route.airline;
  const totals = legs.map((l) => cheapest(l, pax));
  return {
    offerId,
    airline: { code: airline, name: AIRLINE_NAMES[airline] },
    itineraries: legs.map((l, i) => itineraryDto(l, `${offerId}|${i}`, pax)),
    grandTotal: money(
      totals.reduce((s, t) => s + t[0], 0),
      totals.reduce((s, t) => s + t[1], 0),
    ),
  };
}

/* ------------------------------------- operaciones ------------------------------------- */

function badRequest(name: string, reason: string): ApiError {
  return new ApiError({ status: 400, code: 'VALIDATION_FAILED', detail: `${name}: ${reason}`, fieldErrors: [{ field: name, message: reason }] });
}

/** POST /search con las reglas de la API: fechas no pasadas, máximo 9 pasajeros con asiento. */
export function mockSearch(req: SearchRequestDto, now = Date.now()): SearchResponseDto {
  const p = req.passengers;
  const pax = { adults: p.adults ?? 1, youths: p.youths ?? 0, children: p.children ?? 0, infants: p.infants ?? 0 };
  const seated = pax.adults + pax.youths + pax.children;
  if (seated > 9) throw badRequest('passengers', 'at most 9 passengers with seat');
  if (pax.infants > pax.adults) throw badRequest('passengers.infants', 'must not exceed adults');
  const today = todayLocal(now);
  req.itineraries.forEach((it, i) => {
    if (it.departureDate < today) throw badRequest(`itineraries[${i}].departureDate`, 'must not be in the past');
    if (it.origin === it.destination) throw badRequest(`itineraries[${i}].destination`, 'must differ from origin');
  });

  const last = lastScheduledDate(now);
  const legs = req.itineraries.map((it) =>
    it.departureDate > last ? [] : itinerariesFor(it.origin, it.destination, it.departureDate, now),
  );

  let combos: Flight[][][] = legs[0].map((l) => [l]);
  for (const next of legs.slice(1)) {
    combos = combos.flatMap((c) =>
      next
        .filter((l) => l[0].route.airline === c[0][0].route.airline && l[0].depUtc >= c[c.length - 1].at(-1)!.arrUtc + MIN_CONNECTION_MIN * 60_000)
        .map((l) => [...c, l]),
    );
  }

  const offers = combos
    .map((legsOfOffer) => offerDto(legsOfOffer, pax))
    .sort(
      (a, b) =>
        Number(a.grandTotal.total) - Number(b.grandTotal.total) ||
        a.itineraries[0].segments[0].departure.at.localeCompare(b.itineraries[0].segments[0].departure.at),
    )
    .slice(0, MAX_OFFERS);
  return { totalOffers: offers.length, offers };
}

/** Reconstruye una oferta a partir de su id (para el hold y el mapa de asientos). */
export function mockOfferFromId(offerId: string): FlightOfferDto | null {
  const [prefix, pax, ...keys] = offerId.split('~');
  if (prefix !== 'mock' || !pax || keys.length === 0) return null;
  const [adults, youths, children, infants] = pax.split('.').map(Number);
  const legs = keys.map(flightsFromKey);
  if (legs.some((l) => !l)) return null;
  return offerDto(legs as Flight[][], { adults, youths, children, infants });
}

/** GET /offers/{offerId}/seatmap: diseño de cabinas de la semilla, ocupación determinista. */
export function mockSeatMap(offerId: string, segmentId: string): SeatMapDto {
  const offer = mockOfferFromId(offerId);
  const segment = offer?.itineraries.flatMap((it) => it.segments).find((s) => s.segmentId === segmentId);
  if (!segment) throw new ApiError({ status: 404, code: 'VALIDATION_FAILED', detail: 'Seat map not found' });
  const aircraft = (segment.aircraft ?? '320') as MockRoute['aircraft'];
  // Como la API real: todos libres; solo se ocupan los asientos de reservas hechas (mock/purchase.ts).
  return {
    segmentId,
    cabins: CABIN_LAYOUT[aircraft].map((layout, layoutIndex) => ({
      cabinClass: layout.cabin,
      rows: Array.from({ length: layout.to - layout.from + 1 }, (_, i) => {
        const rowNumber = layout.from + i;
        return {
          rowNumber,
          seats: [...layout.letters].map((letter, c) => {
            const characteristics: ('WINDOW' | 'AISLE' | 'EXTRA_LEGROOM' | 'EMERGENCY_EXIT')[] = [];
            if (c === 0 || c === layout.letters.length - 1) characteristics.push('WINDOW');
            if (c === layout.letters.length / 2 - 1 || c === layout.letters.length / 2) characteristics.push('AISLE');
            if (layout.cabin === 'ECONOMY' && i === 0 && layoutIndex > 0) characteristics.push('EXTRA_LEGROOM');
            if (layout.exitRows.includes(rowNumber)) characteristics.push('EMERGENCY_EXIT');
            return { seatNumber: `${rowNumber}${letter}`, isAvailable: true, characteristics };
          }),
        };
      }),
    })),
  };
}

/** GET /flights/{flightNumber}/status: estado coherente con la hora actual. */
export function mockFlightStatus(flightNumber: string, date: string, now = Date.now()): FlightStatusDto {
  const flight = findFlight(flightNumber, date);
  if (!flight) {
    throw new ApiError({ status: 404, code: 'VALIDATION_FAILED', detail: `Flight ${flightNumber} was not found on ${date}` });
  }
  const rand = seeded(`${flightNumber}-${date}-status`);
  const delayMin = rand() < 0.15 ? randomInt(rand, 1, 12) * 5 : 0;
  const estDep = flight.depUtc + delayMin * 60_000;
  const estArr = flight.arrUtc + delayMin * 60_000;
  const iso = (ms: number) => new Date(ms).toISOString();

  let status: FlightStatusDto['status'] = delayMin > 0 ? 'DELAYED' : 'SCHEDULED';
  if (now >= estArr) status = 'ARRIVED';
  else if (now >= estDep) status = 'DEPARTED';
  else if (now >= estDep - 40 * 60_000) status = 'BOARDING';

  return {
    flightNumber: flightNumberOf(flight.route),
    date,
    marketingCarrier: flight.route.airline,
    operatingCarrier: flight.route.airline,
    departure: {
      iataCode: flight.route.origin,
      terminal: null,
      scheduledAt: iso(flight.depUtc),
      estimatedAt: delayMin > 0 ? iso(estDep) : null,
      actualAt: now >= estDep ? iso(estDep) : null,
    },
    arrival: {
      iataCode: flight.route.destination,
      terminal: null,
      scheduledAt: iso(flight.arrUtc),
      estimatedAt: delayMin > 0 ? iso(estArr) : null,
      actualAt: now >= estArr ? iso(estArr) : null,
    },
    aircraft: flight.route.aircraft,
    status,
  };
}
