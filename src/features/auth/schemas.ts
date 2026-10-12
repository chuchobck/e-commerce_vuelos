import { z } from 'zod';
import { es } from '@/shared/i18n';
import { emailField, passwordField } from '@/shared/lib/schemas';
import { travelerSchema } from '@/shared/profile';

const v = es.validation;

/**
 * La cuenta de la API es solo correo y contraseña (sin nombre, documento ni teléfono: el backend no tiene perfil). Las reglas
 * son las del backend: ver shared/lib/credentials.ts.
 */
export const LoginSchema = z.object({
  email: emailField,
  password: passwordField,
  /** "Mantener mi sesión iniciada": guarda el refresh token en localStorage en vez de sessionStorage. */
  remember: z.boolean(),
});
export type LoginInput = z.input<typeof LoginSchema>;

/**
 * Registro: la cuenta (correo y contraseña, lo único que recibe la API) más los datos de quien viaja, que NO viajan a la API: se
 * guardan en este dispositivo (`perfilViajero`). `reference` es el «hoy» con el que se miden la mayoría de edad y el pasaporte.
 */
export const registerSchema = (reference?: Date) =>
  LoginSchema.extend({
    terms: z.boolean().refine((b) => b, v.termsRequired),
    traveler: travelerSchema(reference),
  });
export type RegisterInput = z.input<ReturnType<typeof registerSchema>>;
