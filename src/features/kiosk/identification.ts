import { z } from 'zod';
import { es } from '@/shared/i18n';

const t = es.kiosk.identify;

/** El código de reserva (PNR) se escribe en mayúsculas y sin espacios; solo letras y números. */
export function normalizePnr(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
}

export const identificationSchema = z.object({
  pnr: z.string().regex(/^[A-Z0-9]{6}$/, t.pnrInvalid),
  lastName: z.string().trim().min(1, t.lastNameInvalid).max(100, t.lastNameInvalid),
});

export type Identification = z.infer<typeof identificationSchema>;

/** Errores por campo de lo escrito hasta ahora; un campo vacío no es error (aún falta), solo uno con algo inválido. */
export function identificationIssues(value: { pnr: string; lastName: string }) {
  return {
    missing: [value.pnr === '' ? t.missingPnr : '', value.lastName.trim() === '' ? t.missingLastName : ''].filter((x) => x !== ''),
    pnrError: value.pnr !== '' && !/^[A-Z0-9]{6}$/.test(value.pnr) ? t.pnrInvalid : undefined,
    ready: identificationSchema.safeParse(value).success,
  };
}
