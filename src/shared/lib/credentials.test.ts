import { describe, expect, it } from 'vitest';
import { es } from '@/shared/i18n';
import { isValidEmail, normalizeEmail, passwordLengthIssue } from './credentials';
import { decodeJwtPayload, jwtExpiresAt } from './jwt';
import { emailField, passwordField } from './schemas';

const v = es.validation;
const firstError = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? null : r.error!.issues[0].message);

describe('correo: las mismas reglas que el backend (CorreoNormalizado)', () => {
  it('normaliza como el backend: recorta, NFC y minúsculas', () => {
    expect(normalizeEmail('  Ana@Correo.EC ')).toBe('ana@correo.ec');
    expect(emailField.parse('  Ana@Correo.EC ')).toBe('ana@correo.ec');
  });

  it.each([
    ['ana@correo.ec', true],
    ['ana@correo', false], // require_tld
    ['ana@[192.168.0.1]', false], // allow_ip_domain: false
    ['Ana <ana@correo.ec>', false], // allow_display_name: false
    ['<b>ana</b>@correo.ec', false], // etiquetas HTML
    ['ana\u0000@correo.ec', false], // caracteres de control
    ['an​a@correo.ec', false], // invisibles de formato
  ])('%s → %s', (email, ok) => {
    expect(isValidEmail(normalizeEmail(email))).toBe(ok);
  });

  it('máximo 254 caracteres', () => {
    const local = 'a'.repeat(64);
    const label = 'b'.repeat(63);
    const long = `${local}@${[label, label, label, 'c'.repeat(57)].join('.')}.ec`;
    expect(long.length).toBeGreaterThan(254);
    expect(firstError(emailField.safeParse(long))).toBe(v.emailLength);
  });
});

describe('contraseña: 12 a 128 caracteres, NFKC, sin recortar (como el backend)', () => {
  it('cuenta exactamente desde 12', () => {
    expect(passwordLengthIssue('x'.repeat(11))).toBe('short');
    expect(passwordLengthIssue('x'.repeat(12))).toBeNull();
    expect(passwordLengthIssue('x'.repeat(128))).toBeNull();
    expect(passwordLengthIssue('x'.repeat(129))).toBe('long');
  });

  it('los espacios de los bordes cuentan (no se recortan)', () => {
    expect(passwordLengthIssue(' '.repeat(2) + 'x'.repeat(10))).toBeNull();
  });

  it('se mide tras NFKC (una ligadura cuenta como sus letras)', () => {
    // "ﬁ" (U+FB01) se normaliza a "fi": 6 ligaduras = 12 caracteres (6 sin normalizar).
    expect(passwordLengthIssue('ﬁ'.repeat(6))).toBeNull();
  });

  it('sin reglas de composición: una frase en minúsculas sirve', () => {
    expect(passwordField.safeParse('mi perro come mango').success).toBe(true);
    expect(firstError(passwordField.safeParse(''))).toBe(v.required);
    expect(firstError(passwordField.safeParse('corta'))).toBe(v.passwordLength);
  });
});

describe('JWT: solo se lee el payload (la firma la verifica el backend)', () => {
  const enc = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  it('lee exp en milisegundos', () => {
    const token = `${enc({ alg: 'HS256' })}.${enc({ sub: 'u', exp: 1791349375 })}.firma`;
    expect(jwtExpiresAt(token)).toBe(1791349375 * 1000);
    expect(decodeJwtPayload(token)?.sub).toBe('u');
  });
  it('un token mal formado no rompe', () => {
    expect(jwtExpiresAt('basura')).toBeNull();
    expect(jwtExpiresAt('a.%%%.c')).toBeNull();
    expect(jwtExpiresAt(`${enc({})}.${enc({ exp: 'mañana' })}.x`)).toBeNull();
  });
});
