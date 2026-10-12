import { es } from '@/shared/i18n';
import { parseDisplayDate } from '@/shared/lib/dates';
import { compactDocument, isValidCedula, onlyDigits, PASSPORT_PATTERN } from '@/shared/lib/validators';

const v = es.validation;

export type DocumentType = 'NATIONAL_ID' | 'PASSPORT';

export interface DocumentFields {
  documentType: DocumentType;
  /** ISO 3166-1 alfa-2. */
  nationality: string;
  documentNumber: string;
  /** dd/mm/aaaa; solo con pasaporte. */
  documentExpiryDate: string;
}

/** ¿La cédula aplica? Solo con documento nacional de Ecuador (el backend valida el módulo 10 solo ahí). */
export const isEcuadorianId = (p: Pick<DocumentFields, 'documentType' | 'nationality'>) => p.documentType === 'NATIONAL_ID' && p.nationality === 'EC';

/** Lo que se acepta teclear o pegar en el número de documento (bloquea el resto). */
export function sanitizeDocument(p: Pick<DocumentFields, 'documentType' | 'nationality'>, raw: string): string {
  return isEcuadorianId(p) ? onlyDigits(raw).slice(0, 10) : compactDocument(raw).replace(/[^A-Z0-9]/g, '').slice(0, 20);
}

export interface DocumentIssue {
  path: 'documentNumber' | 'documentExpiryDate';
  message: string;
}

/**
 * Reglas del documento de quien viaja, las mismas del DTO de reserva del backend: cédula con módulo 10 (solo ecuatorianos con
 * documento nacional), de 5 a 20 letras o números en los demás casos, y con pasaporte una fecha de vencimiento posterior a
 * `expiry.after` (el último vuelo del viaje al comprar; hoy en el perfil). Las usan el paso de pasajeros y el perfil.
 */
export function documentIssues(p: DocumentFields, expiry: { after: Date; message: string }): DocumentIssue[] {
  const issues: DocumentIssue[] = [];
  const number = compactDocument(p.documentNumber);
  if (isEcuadorianId(p)) {
    if (number.length !== 10) issues.push({ path: 'documentNumber', message: v.cedulaLength });
    else if (!isValidCedula(number)) issues.push({ path: 'documentNumber', message: v.cedulaInvalid });
  } else if (number && !PASSPORT_PATTERN.test(number)) {
    issues.push({ path: 'documentNumber', message: v.passportInvalid });
  }
  if (p.documentType === 'PASSPORT') {
    const date = parseDisplayDate(p.documentExpiryDate);
    if (!p.documentExpiryDate) issues.push({ path: 'documentExpiryDate', message: v.required });
    else if (!date) issues.push({ path: 'documentExpiryDate', message: v.dateInvalid });
    else if (date <= expiry.after) issues.push({ path: 'documentExpiryDate', message: expiry.message });
  }
  return issues;
}
