/**
 * Huella del dispositivo que exige POST /search (X-Device-Fingerprint): la API acepta de 8 a 128
 * letras, dígitos o `. _ : + / = -`. Es un identificador aleatorio de este navegador, sin datos
 * personales; se guarda para que el backend reconozca búsquedas repetidas del mismo dispositivo.
 */
const KEY = 'quinde.device';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const FINGERPRINT_PATTERN = /^[A-Za-z0-9._:+/=-]{8,128}$/;

let memory: string | null = null;

function randomFingerprint(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return `web-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('')}`;
}

export function deviceFingerprint(): string {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && FINGERPRINT_PATTERN.test(stored)) return stored;
    const fresh = randomFingerprint();
    localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    memory ??= randomFingerprint();
    return memory;
  }
}
