import { z } from 'zod';
import { es } from '@/shared/i18n';
import { parseDisplayDate } from '@/shared/lib/dates';
import { flightNumberField } from '@/shared/lib/schemas';

const v = es.validation;

/** El estado de vuelo se puede consultar también para fechas pasadas recientes. */
export const FlightStatusSchema = z.object({
  flightNumber: flightNumberField,
  date: z
    .string()
    .trim()
    .min(1, v.required)
    .refine((s) => parseDisplayDate(s) !== null, v.dateInvalid),
});
export type FlightStatusInput = z.infer<typeof FlightStatusSchema>;
