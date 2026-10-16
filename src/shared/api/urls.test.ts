import { describe, expect, it } from 'vitest';
import { identityUrlFor } from './urls';

describe('identityUrlFor: de dónde sale la base de la cuenta', () => {
  it('explícita: se usa tal cual (sin barras finales), aunque la API traiga otra cosa', () => {
    expect(identityUrlFor('https://gw.test/flights/v1', 'https://id.test/identity/v1/')).toBe('https://id.test/identity/v1');
    expect(identityUrlFor('http://localhost:3000/flights/v1', ' http://localhost:3001/identity/v1 ')).toBe('http://localhost:3001/identity/v1');
  });

  it('derivada: /flights/v1 → /identity/v1, con o sin barra final y en cualquier puerto o ruta anterior', () => {
    expect(identityUrlFor('https://gw.test/flights/v1')).toBe('https://gw.test/identity/v1');
    expect(identityUrlFor('https://gw.test/flights/v1/')).toBe('https://gw.test/identity/v1');
    expect(identityUrlFor('http://localhost:8080/flights/v1', '')).toBe('http://localhost:8080/identity/v1');
    expect(identityUrlFor('https://gw.test/api/flights/v1', '   ')).toBe('https://gw.test/api/identity/v1');
  });

  it('solo cambia el sufijo: un /flights/v1 en medio de la ruta no se toca', () => {
    expect(identityUrlFor('https://flights/v1.example/flights/v1')).toBe('https://flights/v1.example/identity/v1');
  });

  it('API sin el sufijo /flights/v1 y sin explícita: la cuenta queda en la API (login propio del core)', () => {
    expect(identityUrlFor('https://core.test/v2/')).toBe('https://core.test/v2');
    expect(identityUrlFor('https://core.test', '')).toBe('https://core.test');
  });

  it('API vacía (mock): vacía siempre, aunque haya una URL de identity (no se mezclan)', () => {
    expect(identityUrlFor('')).toBe('');
    expect(identityUrlFor('   ', 'https://id.test/identity/v1')).toBe('');
  });

  it('es idempotente: resolver lo ya resuelto no lo cambia', () => {
    const once = identityUrlFor('https://gw.test/flights/v1');
    expect(identityUrlFor('https://gw.test/flights/v1', once)).toBe(once);
  });
});
