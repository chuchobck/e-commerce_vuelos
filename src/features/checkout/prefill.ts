import { isBookableCountry } from '@/shared/lib/countries';
import { evaluateTraveler, type TravelerKey, type TravelerValues } from '@/shared/profile';
import type { PassengerFormValue, PassengersFormValues } from './passengers';

export interface ProfilePrefill {
  values: PassengersFormValues;
  /** Se llenó al menos un dato del pasajero 1 con el perfil (el formulario lo avisa: «Prellenado con tus datos»). */
  applied: boolean;
  /** Campos del perfil que faltan, están mal o no sirven para comprar: se llenan a mano y se marcan. */
  review: TravelerKey[];
}

/** Lo que identifica a una persona en el formulario: si ya hay algo de esto escrito, el borrador manda y el perfil no pisa nada. */
const PERSONAL: readonly (keyof PassengerFormValue)[] = ['firstName', 'lastName', 'documentNumber', 'birthDate', 'phone'];
/** Lo que depende de la nacionalidad: la cédula y el pasaporte se validan distinto según el país. */
const DEPENDS_ON_NATIONALITY: readonly TravelerKey[] = ['documentType', 'documentNumber', 'documentExpiryDate'];

/**
 * Llena el PASAJERO 1 (solo si es adulto) con el perfil de viajero guardado en este dispositivo. Reglas:
 *  - Nunca toca a los demás pasajeros: ni otros adultos, ni niños, ni infantes (no son quien tiene la cuenta).
 *  - Si el borrador ya trae datos de ese pasajero, no se pisa nada: lo que la persona escribió manda. Un borrador en blanco
 *    (se guardó vacío al abrir el paso 2) sí se llena.
 *  - Solo se llena lo VÁLIDO (con las reglas del perfil). Lo que falta o está mal se deja vacío y se devuelve en `review` para
 *    marcarlo. Con una nacionalidad con la que aún no se puede comprar, tampoco se llena lo que depende de ella.
 *  - El correo de contacto del perfil reemplaza al de la cuenta; si no sirve, queda el de la cuenta.
 */
export function prefillFromProfile(values: PassengersFormValues, profile: TravelerValues | null | undefined, reference?: Date): ProfilePrefill {
  const first = values.passengers[0];
  const untouched: ProfilePrefill = { values, applied: false, review: [] };
  if (!profile || !first || first.type !== 'ADULT' || PERSONAL.some((key) => first[key].trim() !== '')) return untouched;

  const evaluation = evaluateTraveler(profile, reference);
  const bookable = isBookableCountry(profile.nationality);
  const usable = new Set<TravelerKey>(evaluation.valid.filter((key) => bookable || !DEPENDS_ON_NATIONALITY.includes(key)));
  if (!bookable) usable.delete('nationality');
  const pick = <K extends TravelerKey>(key: K, current: PassengerFormValue[K]): PassengerFormValue[K] => (usable.has(key) ? (profile[key] as PassengerFormValue[K]) : current);

  const next: PassengerFormValue = {
    ...first,
    firstName: pick('firstName', first.firstName),
    lastName: pick('lastName', first.lastName),
    documentType: pick('documentType', first.documentType),
    documentNumber: pick('documentNumber', first.documentNumber),
    nationality: pick('nationality', first.nationality),
    documentExpiryDate: pick('documentExpiryDate', first.documentExpiryDate),
    birthDate: pick('birthDate', first.birthDate),
    gender: pick('gender', first.gender),
    email: pick('email', first.email),
    phone: pick('phone', first.phone),
  };
  const review: TravelerKey[] = [...evaluation.missing, ...evaluation.invalid];
  // Con una nacionalidad con la que aún no se puede comprar, lo que se dejó sin llenar por depender de ella también se marca.
  if (!bookable) review.push('nationality', ...evaluation.valid.filter((key) => key === 'documentNumber' || key === 'documentExpiryDate'));
  const filled: readonly TravelerKey[] = ['firstName', 'lastName', 'documentNumber', 'birthDate', 'gender', 'phone', 'email'];
  return {
    values: { ...values, passengers: [next, ...values.passengers.slice(1)] },
    applied: filled.some((key) => usable.has(key)),
    review: [...new Set(review)],
  };
}
