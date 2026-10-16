/**
 * La cuenta contra el contrato de identity (contracts/identity-openapi.json), sin red: las rutas y los métodos que usa
 * RealFlightsApi existen en el contrato, lo que envía cumple sus esquemas (y no agrega campos), y las respuestas del
 * contrato llegan al mismo `User` y `AuthTokens` que ya conocía la sesión. La prueba contra el servicio real es
 * `npm run test:api` (por el gateway).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, it, vi } from 'vitest';
import { createHttpClient } from './http/client';
import { RealFlightsApi } from './RealFlightsApi';
import { IDENTITY_PREFIX } from './urls';

const root = path.resolve(__dirname, '../../..');
const contractText = fs.readFileSync(path.join(root, 'contracts/identity-openapi.json'), 'utf8');
const contract = JSON.parse(contractText) as {
  paths: Record<string, Record<string, { requestBody?: unknown; responses: Record<string, unknown> }>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
};
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'identity', components: contract.components });
const validator = (name: string) => ajv.compile({ $ref: `identity#/components/schemas/${name}` });
const check = (name: string, value: unknown) => {
  const validate = validator(name);
  expect(validate(value), `${name}: ${ajv.errorsText(validate.errors)}`).toBe(true);
};

// Respuestas de ejemplo que cumplen el contrato (se comprueba abajo): lo que el servicio entrega.
const USER = { id: '6b9d5c1e-0f3a-4d0e-9a57-0d2f2f6f1a11', email: 'ana@example.test', roles: ['cliente'], scopes: ['flights:read', 'flights:hold'], createdAt: '2026-10-16T00:00:00.000Z' };
const TOKENS = { access_token: 'header.payload.firma', token_type: 'Bearer', expires_in: 900, refresh_token: 'opaco', scope: 'flights:read flights:hold' };

const BASE = 'https://gw.test/identity/v1';

function recorded() {
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  const fetchStub = vi.fn(async (input: URL | string, init?: RequestInit) => {
    const url = String(input);
    calls.push({ method: init?.method ?? 'GET', url, body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined });
    if (url.endsWith('/auth/logout')) return new Response(null, { status: 204 });
    const body = url.endsWith('/auth/register') || url.endsWith('/auth/me') ? USER : TOKENS;
    return new Response(JSON.stringify(body), { status: url.endsWith('/auth/register') ? 201 : 200, headers: { 'Content-Type': 'application/json' } });
  });
  const http = createHttpClient({ baseUrl: 'https://gw.test/flights/v1', fetchImpl: fetchStub as unknown as typeof fetch });
  return { calls, api: new RealFlightsApi(http, BASE) };
}

describe('contrato de identity: la cuenta', () => {
  it('la copia no se editó a mano: su SHA-256 es el anotado en PROCEDENCIA.md', () => {
    const sha = createHash('sha256').update(contractText).digest('hex');
    expect(fs.readFileSync(path.join(root, 'contracts/PROCEDENCIA.md'), 'utf8')).toContain(sha);
  });

  it('los ejemplos de respuesta de esta prueba cumplen el contrato (no es una validación vacía)', () => {
    check('UsuarioRespuestaDto', USER);
    check('TokenRespuestaDto', TOKENS);
    expect(validator('UsuarioRespuestaDto')({ ...USER, createdAt: undefined })).toBe(false);
    expect(validator('TokenRespuestaDto')({ ...TOKENS, refresh_token: undefined })).toBe(false);
    expect(validator('RegistroDto')({ email: 'ana@example.test', password: 'corta' })).toBe(false);
  });

  it('las cinco rutas y sus métodos son los del contrato, bajo el prefijo de identity', async () => {
    const { api, calls } = recorded();
    await api.register({ email: USER.email, password: 'una frase larga de prueba' });
    await api.login({ email: USER.email, password: 'una frase larga de prueba' });
    await api.refresh('opaco');
    await api.logout('opaco');
    await api.me();

    for (const call of calls) {
      const route = new URL(call.url).pathname;
      expect(route.startsWith(IDENTITY_PREFIX)).toBe(true);
      expect(Object.keys(contract.paths[route] ?? {}), `${call.method} ${route} no está en el contrato`).toContain(call.method.toLowerCase());
    }
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      'POST /identity/v1/auth/register',
      'POST /identity/v1/auth/login',
      'POST /identity/v1/auth/refresh',
      'POST /identity/v1/auth/logout',
      'GET /identity/v1/auth/me',
    ]);
  });

  it('lo que se envía cumple los esquemas del contrato y no agrega campos (nunca un rol)', async () => {
    const { api, calls } = recorded();
    await api.register({ email: USER.email, password: 'una frase larga de prueba' });
    await api.login({ email: USER.email, password: 'una frase larga de prueba' });
    await api.refresh('opaco');
    await api.logout('opaco');
    const schemas: [string, string][] = [['RegistroDto', 'register'], ['LoginDto', 'login'], ['RefrescoDto', 'refresh'], ['RefrescoDto', 'logout']];
    schemas.forEach(([name, action], i) => {
      const body = calls[i].body;
      expect(calls[i].url.endsWith(`/auth/${action}`)).toBe(true);
      check(name, body);
      expect(Object.keys(body ?? {}).sort()).toEqual(Object.keys(contract.components.schemas[name].properties ?? {}).sort());
    });
  });

  it('las respuestas del contrato llegan a los mismos User y AuthTokens de siempre (sin adaptar nada)', async () => {
    const { api } = recorded();
    await expect(api.register({ email: USER.email, password: 'una frase larga de prueba' })).resolves.toEqual(USER);
    await expect(api.login({ email: USER.email, password: 'una frase larga de prueba' })).resolves.toEqual({
      accessToken: TOKENS.access_token,
      refreshToken: TOKENS.refresh_token,
      expiresIn: 900,
      scope: TOKENS.scope,
    });
    await expect(api.me()).resolves.toEqual(USER);
  });

  it('los errores del contrato (ProblemDetails de identity) se leen como los del core: mismos códigos', () => {
    const codes = (contract.components.schemas.CodigoError as unknown as { enum: string[] }).enum;
    expect(codes).toEqual(['VALIDATION_FAILED', 'RATE_LIMIT_EXCEEDED']);
  });
});
