import { useMemo, useSyncExternalStore } from 'react';
import { perfilViajero, parseStoredProfile } from './perfilViajero';
import { evaluateTraveler, type TravelerValues } from './traveler';

export interface PerfilViajeroState {
  /** El perfil guardado de este usuario (puede estar incompleto), o null si no hay ninguno. */
  profile: TravelerValues | null;
  /** Hay un perfil guardado. */
  saved: boolean;
  /** El perfil guardado está completo y correcto. */
  complete: boolean;
}

/** El perfil del usuario, siempre al día: cambia al guardar o borrar aquí y al hacerlo en otra pestaña. */
export function usePerfilViajero(userId: string | null | undefined): PerfilViajeroState {
  const raw = useSyncExternalStore(
    perfilViajero.subscribe,
    () => perfilViajero.raw(userId),
    () => null,
  );
  return useMemo(() => {
    const profile = parseStoredProfile(raw);
    return { profile, saved: profile !== null, complete: profile !== null && evaluateTraveler(profile).complete };
  }, [raw]);
}
