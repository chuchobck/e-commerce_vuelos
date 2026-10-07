import { z } from 'zod';
import { es } from '@/shared/i18n';
import { cedulaField, emailField, nameField, passportField, passwordField, phoneField } from '@/shared/lib/schemas';

const v = es.validation;

export const LoginSchema = z.object({
  email: emailField,
  // Al ingresar no se exige longitud mínima: solo que no esté vacía.
  password: z.string().min(1, v.required),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const RegisterSchema = z
  .object({
    firstName: nameField,
    lastName: nameField,
    documentType: z.enum(['CEDULA', 'PASSPORT']),
    documentNumber: z.string().trim().min(1, v.required),
    email: emailField,
    phone: phoneField,
    password: passwordField,
    terms: z.boolean().refine((b) => b, v.termsRequired),
  })
  .superRefine((data, ctx) => {
    if (!data.documentNumber) return;
    const field = data.documentType === 'CEDULA' ? cedulaField : passportField;
    const result = field.safeParse(data.documentNumber);
    if (!result.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['documentNumber'], message: result.error.issues[0].message });
    }
  });
export type RegisterInput = z.infer<typeof RegisterSchema>;
