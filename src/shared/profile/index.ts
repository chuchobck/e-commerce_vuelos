/**
 * Datos de quien viaja: reglas (documento, nacimiento, contacto) y perfil de viajero guardado en este dispositivo.
 * Lo usan el registro, Mi perfil y el paso de pasajeros de la compra, por eso vive en `shared`.
 */
export { documentIssues, isEcuadorianId, sanitizeDocument, type DocumentFields, type DocumentIssue, type DocumentType } from './documents';
export { createPerfilViajero, parseStoredProfile, perfilViajero, type PerfilStorage, type PerfilViajeroDeps, type PerfilViajeroService } from './perfilViajero';
export { ADULT_AGE, emptyTraveler, evaluateTraveler, normalizeTraveler, TRAVELER_KEYS, travelerSchema, type TravelerEvaluation, type TravelerKey, type TravelerValues } from './traveler';
export { usePerfilViajero, type PerfilViajeroState } from './usePerfilViajero';
export { TravelerFields, type TravelerFieldsProps } from './TravelerFields';
