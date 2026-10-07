import type { PassengerFormValue } from './passengers';

/** Campo de la API (p. ej. "passengers[1].contact.email") → campo del formulario de pasajeros. */
export function apiFieldToForm(field: string): { index: number; name: keyof PassengerFormValue } | null {
  const match = /^passengers\[(\d+)\]\.(\w+)(?:\.(\w+))?/.exec(field);
  if (!match) return null;
  const index = Number(match[1]);
  const [, , head, tail] = match;
  if (head === 'contact') return tail === 'phone' ? { index, name: 'phone' } : { index, name: 'email' };
  if (head === 'associatedAdultId') return { index, name: 'adultIndex' };
  const known: (keyof PassengerFormValue)[] = ['firstName', 'lastName', 'documentType', 'documentNumber', 'nationality', 'documentExpiryDate', 'birthDate', 'gender'];
  const name = known.find((k) => k === head);
  return name ? { index, name } : null;
}
