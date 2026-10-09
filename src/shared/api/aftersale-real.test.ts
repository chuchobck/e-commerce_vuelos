import { describe, expect, it, vi } from 'vitest';
import type { HttpClient, HttpResult } from './http/client';
import { RealFlightsApi } from './RealFlightsApi';

/** Cliente HTTP falso: responde lo que se le diga y recuerda cómo lo llamaron. */
function fakeHttp(response: HttpResult<unknown> = { status: 200, body: {} }) {
  const requestWithStatus = vi.fn(async () => response);
  const request = vi.fn(async () => response.body);
  return { http: { request, requestWithStatus } as unknown as HttpClient, request, requestWithStatus };
}

const KEY = '3f2b8a6e-6a8e-4a0e-9d0e-0c6f5f6b0a11';
const MONEY = { currency: 'USD', total: '12.50' };

describe('RealFlightsApi: postventa (rutas, cabeceras y códigos del contrato)', () => {
  it('lista de reservas: GET /bookings con cursor y límite, como lectura con sesión', async () => {
    const { http, request } = fakeHttp({ status: 200, body: { nextCursor: 'c2', items: [{ bookingId: 'b1', pnr: 'ABC123', status: 'CONFIRMED', origin: 'UIO', destination: 'GYE', departureDate: '2026-10-20', grandTotal: MONEY }] } });
    const page = await new RealFlightsApi(http).listBookings({ cursor: 'c1', limit: 10 });
    expect(request).toHaveBeenCalledWith('GET', '/bookings', { auth: true, retry: true, query: { cursor: 'c1', limit: '10' } });
    expect(page.nextCursor).toBe('c2');
    expect(page.items[0]).toMatchObject({ id: 'b1', code: 'ABC123', status: 'CONFIRMED', origin: 'UIO', total: { cents: 1250 } });
  });

  it('un estado de la lista que el contrato no define no rompe: queda en null', async () => {
    const { http } = fakeHttp({ status: 200, body: { items: [{ bookingId: 'b1', pnr: 'X', status: 'RARO', origin: 'UIO', destination: 'GYE' }] } });
    const page = await new RealFlightsApi(http).listBookings();
    expect(page.items[0].status).toBeNull();
    expect(page.nextCursor).toBeNull();
  });

  it('boletos y pases: lecturas con sesión y la forma del contrato', async () => {
    const tickets = fakeHttp({ status: 200, body: { bookingId: 'b/1', tickets: [{ ticketId: 't1', bookingId: 'b/1', passengerId: 'PAX1', eTicketNumber: '045123', status: 'ISSUED', segments: [{ segmentId: 's1', status: 'ISSUED', couponNumber: '1' }] }] } });
    const list = await new RealFlightsApi(tickets.http).getTickets('b/1');
    expect(tickets.request).toHaveBeenCalledWith('GET', '/bookings/b%2F1/tickets', { auth: true, retry: true });
    expect(list[0]).toMatchObject({ id: 't1', number: '045123', segments: [{ segmentId: 's1', coupon: '1' }] });

    const passes = fakeHttp({ status: 200, body: { bookingId: 'b1', boardingPasses: [{ passengerId: 'PAX1', segmentId: 's1', seat: '12A', barcode: 'M1TEST', barcodeType: 'QR', boardingGroup: null }] } });
    await expect(new RealFlightsApi(passes.http).getBoardingPasses('b1')).resolves.toEqual([
      { passengerId: 'PAX1', segmentId: 's1', seat: '12A', boardingGroup: null, boardingPosition: null, barcode: 'M1TEST', barcodeType: 'QR' },
    ]);
  });

  it('check-in: POST con Idempotency-Key y sesión, sin reintento automático', async () => {
    const { http, requestWithStatus, request } = fakeHttp({ status: 200, body: { bookingId: 'b1', status: 'COMPLETED', checkedInPassengers: [{ passengerId: 'PAX1', status: 'CHECKED_IN', segments: [{ segmentId: 's1', seat: '12A', status: 'CHECKED_IN' }] }] } });
    const result = await new RealFlightsApi(http).checkIn('b1', KEY);
    expect(request).toHaveBeenCalledWith('POST', '/bookings/b1/check-in', { headers: { 'Idempotency-Key': KEY }, auth: true });
    expect(requestWithStatus).not.toHaveBeenCalled();
    expect(result.passengers[0].segments[0]).toEqual({ segmentId: 's1', seat: '12A', status: 'CHECKED_IN' });
  });

  it('equipaje: la referencia de pago viaja como payment.paymentReference y 200 es "hecho"', async () => {
    const { http, requestWithStatus } = fakeHttp({ status: 200, body: { passengerId: 'PAX1', itineraryId: 'i1', totalBaggage: 2 } });
    const outcome = await new RealFlightsApi(http).addBaggage('b1', { passengerId: 'PAX1', itineraryId: 'i1', quantity: 1, paymentReference: 'PAY-OK-ABCD1234' }, KEY);
    expect(requestWithStatus).toHaveBeenCalledWith('POST', '/bookings/b1/baggage', {
      body: { passengerId: 'PAX1', itineraryId: 'i1', quantity: 1, payment: { paymentReference: 'PAY-OK-ABCD1234' } },
      headers: { 'Idempotency-Key': KEY },
      auth: true,
    });
    expect(outcome).toEqual({ status: 'done', data: { passengerId: 'PAX1', itineraryId: 'i1', totalBaggage: 2 } });
  });

  it('equipaje: 201 también es hecho y 202 (aunque venga sin cuerpo) es "en proceso"', async () => {
    const created = fakeHttp({ status: 201, body: { totalBaggage: 1 } });
    expect((await new RealFlightsApi(created.http).addBaggage('b1', { passengerId: 'P', itineraryId: 'i', quantity: 1, paymentReference: 'PAY-OK-ABCD1234' }, KEY)).status).toBe('done');
    const pending = fakeHttp({ status: 202, body: undefined });
    expect(await new RealFlightsApi(pending.http).addBaggage('b1', { passengerId: 'P', itineraryId: 'i', quantity: 1, paymentReference: 'PAY-PEND-ABCD1234' }, KEY)).toEqual({ status: 'pending' });
  });

  it('cambio de fecha: la búsqueda es una lectura (con reintento) y los importes de texto pasan a centavos con signo', async () => {
    const { http, request } = fakeHttp({
      status: 200,
      body: [{ changeOfferId: 'co1', expiresAt: '2026-10-20T12:00:00Z', segments: [], priceDifference: { fareDifference: '-10.00', taxDifference: '-2.00', changeFee: '25.00', totalToPay: '13.00' } }],
    });
    const options = await new RealFlightsApi(http).searchDateChange('b1', [{ itineraryId: 'i1', newDepartureDate: '2026-10-22' }]);
    expect(request).toHaveBeenCalledWith('POST', '/bookings/b1/date-change/search', {
      body: { changes: [{ itineraryId: 'i1', newDepartureDate: '2026-10-22' }] },
      auth: true,
      retry: true,
    });
    expect(options[0].price).toEqual({ fare: { cents: -1000, currency: 'USD' }, taxes: { cents: -200, currency: 'USD' }, fee: { cents: 2500, currency: 'USD' }, total: { cents: 1300, currency: 'USD' } });
  });

  it('cambio de fecha: sin pago no manda "payment"; 202 es CHANGE_PENDING (en proceso); 200 devuelve la reserva', async () => {
    const pending = fakeHttp({ status: 202, body: undefined });
    expect(await new RealFlightsApi(pending.http).confirmDateChange('b1', { changeOfferId: 'co1' }, KEY)).toEqual({ status: 'pending' });
    expect(pending.requestWithStatus).toHaveBeenCalledWith('POST', '/bookings/b1/date-change', { body: { changeOfferId: 'co1' }, headers: { 'Idempotency-Key': KEY }, auth: true });

    const withPayment = fakeHttp({ status: 200, body: undefined });
    await new RealFlightsApi(withPayment.http).confirmDateChange('b1', { changeOfferId: 'co1', paymentReference: 'PAY-OK-ABCD1234' }, KEY);
    expect(withPayment.requestWithStatus).toHaveBeenCalledWith('POST', '/bookings/b1/date-change', {
      body: { changeOfferId: 'co1', payment: { paymentReference: 'PAY-OK-ABCD1234' } },
      headers: { 'Idempotency-Key': KEY },
      auth: true,
    });
  });

  it('cancelación: cotización (lectura) y cancelación con quoteId e Idempotency-Key; 202 es en proceso', async () => {
    const quote = fakeHttp({ status: 200, body: { quoteId: 'q1', isRefundable: true, refundAmount: '90.00', penaltyAmount: '10.00', currency: 'USD', expiresAt: '2026-10-20T12:00:00Z' } });
    const q = await new RealFlightsApi(quote.http).getCancellationQuote('b1');
    expect(quote.request).toHaveBeenCalledWith('GET', '/bookings/b1/cancellation-quote', { auth: true, retry: true });
    expect(q).toMatchObject({ quoteId: 'q1', refundable: true, refund: { cents: 9000 }, penalty: { cents: 1000 } });

    const done = fakeHttp({ status: 200, body: undefined });
    expect(await new RealFlightsApi(done.http).cancelBooking('b1', { quoteId: 'q1', reason: 'Cambio de planes' }, KEY)).toEqual({ status: 'done', data: undefined });
    expect(done.requestWithStatus).toHaveBeenCalledWith('POST', '/bookings/b1/cancel', { body: { quoteId: 'q1', reason: 'Cambio de planes' }, headers: { 'Idempotency-Key': KEY }, auth: true });
    const pending = fakeHttp({ status: 202, body: undefined });
    expect(await new RealFlightsApi(pending.http).cancelBooking('b1', { quoteId: 'q1' }, KEY)).toEqual({ status: 'pending' });
  });
});
