import { addDays, subDays } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { es } from '@/shared/i18n';
import { toDisplayDate, today } from '@/shared/lib/dates';
import { formToQuery, queryToForm, queryToSearch } from './searchQuery';
import { SearchFormSchema, type SearchFormInput } from './searchSchema';

const v = es.validation;
const inDays = (n: number) => toDisplayDate(addDays(today(), n));

const valid: SearchFormInput = {
  tripType: 'ONE_WAY',
  origin: 'UIO',
  destination: 'GYE',
  departDate: inDays(10),
  returnDate: '',
  adults: 1,
  children: 0,
  infants: 0,
  cabin: 'ECONOMY',
};

function errorsOf(input: Partial<SearchFormInput>) {
  const result = SearchFormSchema.safeParse({ ...valid, ...input });
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
}

describe('SearchFormSchema', () => {
  it('acepta una búsqueda válida solo ida y con vuelta', () => {
    expect(errorsOf({})).toEqual({});
    expect(errorsOf({ tripType: 'ROUND', returnDate: inDays(15) })).toEqual({});
  });
  it('origen y destino obligatorios y distintos', () => {
    expect(errorsOf({ origin: '' }).origin).toBe(v.requiredSelect);
    expect(errorsOf({ destination: 'UIO' }).destination).toBe(v.sameAirport);
  });
  it('fechas no pasadas y regreso ≥ salida', () => {
    expect(errorsOf({ departDate: toDisplayDate(subDays(today(), 1)) }).departDate).toBe(v.datePast);
    expect(errorsOf({ tripType: 'ROUND', returnDate: inDays(5) }).returnDate).toBe(v.returnBeforeDeparture);
    expect(errorsOf({ tripType: 'ROUND', returnDate: inDays(10) })).toEqual({});
  });
  it('el regreso es obligatorio solo en ida y vuelta', () => {
    expect(errorsOf({ tripType: 'ROUND', returnDate: '' }).returnDate).toBe(v.returnRequired);
    expect(errorsOf({ tripType: 'ONE_WAY', returnDate: '' })).toEqual({});
  });
  it('máximo 9 pasajeros en total', () => {
    expect(errorsOf({ adults: 5, children: 4 })).toEqual({});
    expect(errorsOf({ adults: 5, children: 4, infants: 1 }).adults).toBe(v.maxPassengers);
  });
  it('al menos un adulto e infantes no mayores que adultos', () => {
    expect(errorsOf({ adults: 0 }).adults).toBe(v.minAdults);
    expect(errorsOf({ adults: 2, infants: 2 })).toEqual({});
    expect(errorsOf({ adults: 1, infants: 2 }).infants).toBe(v.infantsPerAdult);
  });
});

describe('búsqueda en la URL', () => {
  it('ida y vuelta se conserva al serializar', () => {
    const input = { ...valid, tripType: 'ROUND' as const, returnDate: inDays(12), adults: 2, infants: 1, cabin: 'BUSINESS' as const };
    const q = new URLSearchParams(formToQuery(input));
    expect(queryToForm(q)).toEqual(input);
    const params = queryToSearch(q)!;
    expect(params.passengers).toEqual({ adults: 2, children: 0, infants: 1 });
    expect(params.returnDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('rechaza URLs manipuladas', () => {
    expect(queryToSearch(new URLSearchParams('origen=UIO&destino=UIO&ida=2030-01-01'))).toBeNull();
    expect(queryToSearch(new URLSearchParams('origen=UIO&destino=GYE&ida=mañana'))).toBeNull();
    expect(queryToSearch(new URLSearchParams('origen=UIO&destino=GYE&ida=2030-01-01&adultos=1&infantes=3'))).toBeNull();
  });
});
