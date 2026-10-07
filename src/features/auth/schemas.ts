import { z } from 'zod';
import { es } from '@/shared/i18n';
import { emailField, passwordField } from '@/shared/lib/schemas';

const v = es.validation;

/**
 * La cuenta de la API es solo correo y contraseña (sin nombre, documento ni teléfono: esos datos
 * se piden por pasajero en la compra). Las reglas son las del backend: ver shared/lib/credentials.ts.
 */
export const LoginSchema = z.object({
  email: emailField,
  password: passwordField,
  /** "Mantener mi sesión iniciada": guarda el refresh token en localStorage en vez de sessionStorage. */
  remember: z.boolean(),
});
export type LoginInput = z.input<typeof LoginSchema>;

export const RegisterSchema = LoginSchema.extend({
  terms: z.boolean().refine((b) => b, v.termsRequired),
});
export type RegisterInput = z.input<typeof RegisterSchema>;
