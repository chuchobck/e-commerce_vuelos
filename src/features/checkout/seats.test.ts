import { describe, expect, it } from 'vitest';
import { ApiError, type BookingPassenger, type Hold } from '@/shared/api';
import { es } from '@/shared/i18n';
import { createDraftStore, sanitizeDraft } from './draft';
import { classifyPaymentError, reduce, type CheckoutState } from './machine';
import { purchaseNotice } from './messages';
import { seatsFromDraft, toBookingPassengers, type PassengersFormValues } from './passengers';
import { anySeatChosen, seatLines } from './seatLines';

const f = es.checkoutForms;
const leg = (...segments: [string, string, string][]) => ({ itinerary: { segments: segments.map(([id, origin, destination]) => ({ id, origin, destination })) } });
const OUT = leg(['s1', 'UIO', 'GYE'], ['s2', 'GYE', 'GPS']);
const BACK = leg(['s3', 'GPS', 'UIO']);
const pax = (id: string, type: string, name: string, seats?: BookingPassenger['seats']) => ({ id, type, firstName: name, lastName: 'Pérez', seats });

describe('asientos por pasajero y tramo', () => {
  it('seatLines: en el orden del viaje, con "automático" y "en brazos"', () => {
    const lines = seatLines(
      [
        pax('PAX1', 'ADULT', 'Ana', [{ segmentId: 's3', seatNumber: '14C' }, { segmentId: 's1', seatNumber: '12A' }]),
        pax('PAX2', 'ADULT', 'Luis'),
        pax('PAX3', 'INFANT', 'Luz', [{ segmentId: 's1', seatNumber: '1A' }]),
      ],
      OUT,
      BACK,
    );
    expect(lines.map((l) => [l.name, l.text, l.chosen])).toEqual([
      ['Ana Pérez', 'UIO → GYE: 12A · GPS → UIO: 14C', true],
      ['Luis Pérez', f.seatAutoShort, false],
      ['Luz Pérez', f.seatInfant, false],
    ]);
    expect(anySeatChosen(lines)).toBe(true);
    expect(anySeatChosen(seatLines([pax('PAX1', 'ADULT', 'Ana')], OUT))).toBe(false);
    // Aún sin nombre: "Pasajero 1".
    expect(seatLines([{ ...pax('PAX1', 'ADULT', ''), lastName: '' }], OUT)[0].name).toBe('Pasajero 1');
  });

  it('toBookingPassengers: assignedSeats por tramo; se omite sin elección y los infantes nunca llevan', () => {
    const values = {
      passengers: ['ADULT', 'ADULT', 'INFANT'].map((type) => ({
        type, firstName: 'N', lastName: 'A', documentType: 'NATIONAL_ID', documentNumber: '1710034065', nationality: 'EC',
        documentExpiryDate: '', birthDate: '15/04/1990', gender: 'F', adultIndex: type === 'INFANT' ? '0' : '', email: 'a@b.cc', phone: '991234567',
      })),
      sameContact: true,
      seats: { PAX1: { s2: '12B', s1: '12A' }, PAX3: { s1: '1A' } },
    } as unknown as PassengersFormValues;
    const order = ['s1', 's2'];
    const out = toBookingPassengers(values, (v, id) => order.flatMap((s) => (v[id]?.[s] ? [{ segmentId: s, seatNumber: v[id][s] }] : [])));
    expect(out[0].seats).toEqual([{ segmentId: 's1', seatNumber: '12A' }, { segmentId: 's2', seatNumber: '12B' }]);
    expect(out[1]).not.toHaveProperty('seats');
    expect(out[2]).not.toHaveProperty('seats');
  });

  it('el borrador recupera los asientos solo de los tramos de este viaje y nunca de infantes', () => {
    const draft = [
      { ...pax('PAX1', 'ADULT', 'Ana'), seats: [{ segmentId: 's1', seatNumber: '12A' }, { segmentId: 'otro-vuelo', seatNumber: '3C' }] },
      { ...pax('PAX2', 'INFANT', 'Luz'), seats: [{ segmentId: 's1', seatNumber: '1A' }] },
    ] as BookingPassenger[];
    expect(seatsFromDraft(draft, ['s1', 's2'])).toEqual({ PAX1: { s1: '12A' } });
    expect(seatsFromDraft(draft, [])).toEqual({});
  });
});

describe('borrador viejo o dañado', () => {
  const ok = { id: 'PAX1', type: 'ADULT', firstName: 'Ana', lastName: 'Pérez', birthDate: '1990-04-15' };

  it('quita el asiento suelto del formato antiguo y los asientos mal formados, y conserva el resto', () => {
    const [p] = sanitizeDraft([{ ...ok, seatId: '12A', seats: [{ segmentId: 's1', seatNumber: '12A' }, { segmentId: 5 }, null] }]);
    expect(p).toMatchObject({ id: 'PAX1', firstName: 'Ana', seats: [{ segmentId: 's1', seatNumber: '12A' }] });
    expect(p).not.toHaveProperty('seatId');
    expect(sanitizeDraft([{ ...ok, seatId: '12A' }])[0]).not.toHaveProperty('seats');
    expect(sanitizeDraft([{ ...ok, seats: 'basura' }])[0]).not.toHaveProperty('seats');
  });

  it('si un pasajero no se reconoce, ignora todo el borrador (no rompe la pantalla)', () => {
    expect(sanitizeDraft([ok, { nada: true }])).toEqual([]);
    expect(sanitizeDraft('texto')).toEqual([]);
    expect(sanitizeDraft(null)).toEqual([]);
  });

  it('el almacén lo aplica al leer sessionStorage', () => {
    const data = new Map<string, string>([['quinde.checkout.draft', JSON.stringify([{ ...ok, seatId: '9C' }])]]);
    const store = createDraftStore({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) });
    expect(store.load()[0]).toMatchObject({ id: 'PAX1' });
    expect(store.load()[0]).not.toHaveProperty('seatId');
    data.set('quinde.checkout.draft', '{no es json');
    expect(store.load()).toEqual([]);
  });
});

describe('errores de asiento al reservar', () => {
  const hold = { id: 'h', status: 'HELD', remainingSeconds: 600, receivedAt: 0 } as Hold;

  it('409 SEAT_TAKEN y 422 SEAT_CABIN_MISMATCH vuelven a los datos con el error y el hold vivo', () => {
    for (const [status, code] of [[409, 'SEAT_TAKEN'], [422, 'SEAT_CABIN_MISMATCH']] as const) {
      const error = new ApiError({ status, code });
      expect(classifyPaymentError(error, hold)).toMatchObject({ step: 'held', hold, passengersReady: false, bookingError: error });
    }
  });

  it('un asiento que la API rechaza por otra razón (no existe, tramo ajeno, repetido) también se revisa en los datos', () => {
    const missing = new ApiError({ status: 422, code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'passengers[0].assignedSeats', message: 'x' }] });
    const twice = new ApiError({ status: 400, code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'passengers[1].assignedSeats[0].seatNumber', message: 'x' }] });
    expect(classifyPaymentError(missing, hold)).toMatchObject({ step: 'held', bookingError: missing });
    expect(classifyPaymentError(twice, hold)).toMatchObject({ step: 'held', bookingError: twice });
  });

  it('el error se conserva mientras se edita y se limpia al continuar con los datos revisados', () => {
    const error = new ApiError({ status: 409, code: 'SEAT_TAKEN' });
    const held = classifyPaymentError(error, hold);
    const editing = reduce(held, { type: 'PASSENGERS', ready: false });
    expect(editing).toMatchObject({ step: 'held', bookingError: error });
    const ready = reduce(editing, { type: 'PASSENGERS', ready: true });
    expect(ready).toMatchObject({ step: 'held', passengersReady: true });
    expect((ready as Extract<CheckoutState, { step: 'held' }>).bookingError).toBeUndefined();
  });

  it('mensajes: ocupado, otra cabina y otro rechazo, cada uno con qué hacer', () => {
    const notice = (code: string, status: number) => purchaseNotice({ step: 'held', hold, passengersReady: false, passengerErrors: [], bookingError: new ApiError({ status, code: code as 'SEAT_TAKEN' }) });
    expect(notice('SEAT_TAKEN', 409)).toMatchObject({ title: f.seatsTakenTitle, text: f.seatsTakenText });
    expect(notice('SEAT_CABIN_MISMATCH', 422)).toMatchObject({ text: f.seatsCabinText });
    expect(notice('VALIDATION_FAILED', 422)).toMatchObject({ text: f.seatsInvalidText });
    expect(f.seatsTakenText).toMatch(/conservamos los demás/);
  });
});
