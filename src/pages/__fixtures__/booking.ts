import type { Booking } from '@/shared/api';

/** Reserva confirmada de un adulto en un solo vuelo UIO → GYE, con la forma de dominio que usan las pantallas. */
export const BOOKING = {
  id: 'b1',
  code: 'QG4P9X',
  status: 'CONFIRMED',
  createdAt: '2026-10-01T10:00:00Z',
  outbound: {
    itinerary: {
      id: 'it1',
      durationMinutes: 60,
      stops: 0,
      segments: [
        { id: 's1', flightNumber: 'LA1400', carrier: 'LA', origin: 'UIO', destination: 'GYE', departureTime: '2026-11-20T08:00:00-05:00', arrivalTime: '2026-11-20T09:00:00-05:00', durationMinutes: 60, aircraft: null, layoverMinutes: null },
      ],
    },
    fare: { cabin: 'ECONOMY', brand: 'CLASSIC', refundable: false, changeable: true, baggage: { personalItem: true, carryOn: 1, checked: 1 }, extraBagPrice: null },
  },
  passengers: [
    { id: 'PAX1', type: 'ADULT', firstName: 'Ana', lastName: 'Pérez', documentType: 'NATIONAL_ID', documentNumber: '1710034065', nationality: 'EC', birthDate: '1990-04-18', gender: 'F', email: 'a@b.ec', phone: '+593991234567', seats: [], extraBaggage: [] },
  ],
  tickets: [],
  total: { cents: 10000, currency: 'USD' },
  changes: [],
} satisfies Booking;
