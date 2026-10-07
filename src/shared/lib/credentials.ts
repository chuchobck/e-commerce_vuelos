/**
 * Reglas de correo y contraseña IGUALES a las del backend (src/modules/auth/dto/credenciales.dto.ts,
 * src/common/sanitizacion/correo.decorator.ts y texto.ts), para que el formulario nunca deje pasar
 * algo que la API rechace con un 400. Las usan los formularios (features/auth) y el mock.
 */
import isEmail from 'validator/es/lib/isEmail';

export const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

/** Controles C0/C1 (\p{Cc}) e invisibles de formato que el backend rechaza. */
const CONTROL = /\p{Cc}/u;
const INVISIBLE_RANGES: [number, number][] = [
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];
const INVISIBLES = new RegExp(
  `[${INVISIBLE_RANGES.map(([from, to]) => String.fromCodePoint(from) + '-' + String.fromCodePoint(to)).join('')}]`,
  'u',
);
/** `<` seguido de letra, `/`, `!` o `?`: abre una etiqueta HTML. */
const HTML_TAG = /<[a-zA-Z/!?]/;

/** Como el backend: recorta, NFC y minúsculas. `Ana@Correo.ec ` = `ana@correo.ec`. */
export function normalizeEmail(value: string): string {
  return value.trim().normalize('NFC').toLowerCase();
}

/** Valida un correo YA normalizado con las mismas opciones de `class-validator` (librería validator). */
export function isValidEmail(normalized: string): boolean {
  return (
    normalized.length > 0 &&
    normalized.length <= EMAIL_MAX_LENGTH &&
    !CONTROL.test(normalized) &&
    !INVISIBLES.test(normalized) &&
    !HTML_TAG.test(normalized) &&
    isEmail(normalized, { allow_display_name: false, allow_ip_domain: false, require_tld: true })
  );
}

/**
 * Como el backend: NFKC y SIN recortar (un espacio al borde es parte de la contraseña).
 * La longitud se mide en unidades de JavaScript, igual que class-validator.
 */
export function normalizePassword(value: string): string {
  return value.normalize('NFKC');
}

export function passwordLengthIssue(value: string): 'short' | 'long' | null {
  const length = normalizePassword(value).length;
  if (length < PASSWORD_MIN_LENGTH) return 'short';
  if (length > PASSWORD_MAX_LENGTH) return 'long';
  return null;
}
