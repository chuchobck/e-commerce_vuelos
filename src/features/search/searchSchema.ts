import { z } from 'zod';
import { hasFlights, type SearchCabin } from '@/shared/api';
import { es } from '@/shared/i18n';
import { parseDisplayDate } from '@/shared/lib/dates';
import { futureDateField, optionalFutureDateField } from '@/shared/lib/schemas';

const v = es.validation;

export const MAX_PASSENGERS = 9;

export const CABINS = ['ECONOMY', 'BUSINESS'] as const satisfies readonly SearchCabin[];
export const TRIP_TYPES = ['ROUND', 'ONE_WAY'] as const;
export type TripType = (typeof TRIP_TYPES)[number];

/**
 * Buscador de vuelos. Las fechas llegan en formato visible "dd/mm/aaaa".
 * Reglas: origen ≠ destino y con vuelos entre ambos, fechas no pasadas, regreso obligatorio y ≥ salida en "Ida y vuelta",
 * 1–9 pasajeros, al menos 1 adulto e infantes ≤ adultos (cada infante viaja en brazos de un adulto).
 */
export const SearchFormSchema = z
  .object({
    tripType: z.enum(TRIP_TYPES),
    origin: z.string().min(1, v.requiredSelect),
    destination: z.string().min(1, v.requiredSelect),
    departDate: futureDateField,
    returnDate: optionalFutureDateField,
    adults: z.number().int().min(1, v.minAdults).max(MAX_PASSENGERS, v.maxPassengers),
    children: z.number().int().min(0).max(MAX_PASSENGERS, v.maxPassengers),
    infants: z.number().int().min(0).max(MAX_PASSENGERS, v.maxPassengers),
    cabin: z.enum(CABINS),
  })
  .superRefine((data, ctx) => {
    if (data.origin && data.destination && data.origin === data.destination) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['destination'], message: v.sameAirport });
    } else if (data.origin && data.destination && !hasFlights(data.origin, data.destination)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['destination'], message: v.noRoute });
    } else if (data.tripType === 'ROUND' && data.origin && data.destination && !hasFlights(data.destination, data.origin)) {
      // Hay rutas de un solo sentido por los horarios de conexión (p. ej. CUE→GPS existe, GPS→CUE no).
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['destination'], message: v.noReturnRoute });
    }
    if (data.tripType === 'ROUND') {
      if (!data.returnDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['returnDate'], message: v.returnRequired });
      } else {
        const depart = parseDisplayDate(data.departDate);
        const back = parseDisplayDate(data.returnDate);
        if (depart && back && back < depart) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['returnDate'], message: v.returnBeforeDeparture });
        }
      }
    }
    if (data.adults + data.children + data.infants > MAX_PASSENGERS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['adults'], message: v.maxPassengers });
    }
    if (data.infants > data.adults) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['infants'], message: v.infantsPerAdult });
    }
  });

export type SearchFormInput = z.infer<typeof SearchFormSchema>;

export const SEARCH_DEFAULTS: SearchFormInput = {
  tripType: 'ROUND',
  origin: '',
  destination: '',
  departDate: '',
  returnDate: '',
  adults: 1,
  children: 0,
  infants: 0,
  cabin: 'ECONOMY',
};
