import { describe, expect, it } from 'vitest';
import { es, fmt } from '@/shared/i18n';
import { ApiError, authErrorMessage, authFieldErrors, errorMessage, fieldErrorMessage, NotYetConnectedError } from './errors';

const e = es.errors;
const err = (status: number, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) => new ApiError({ status, ...extra });

describe('mensajes de error por status (qué pasó y qué hacer)', () => {
  it.each([
    [400, e.badRequest400],
    [401, e.unauthorized401],
    [403, e.forbidden403],
    [404, e.notFound404],
    [409, e.conflict409],
    [422, e.validation422],
    [503, e.unavailable503],
    [500, e.server5xx],
    [502, e.server5xx],
  ])('%i', (status, message) => {
    expect(errorMessage(err(status))).toBe(message);
  });

  it('429 dice cuánto esperar si viene Retry-After', () => {
    expect(errorMessage(err(429, { retryAfter: 17 }))).toBe(fmt(e.rateLimited, { seconds: 17 }));
    expect(errorMessage(err(429))).toBe(e.rateLimitedNoTime);
  });

  it('503 con Retry-After también dice cuánto esperar', () => {
    expect(errorMessage(err(503, { retryAfter: 5 }))).toBe(fmt(e.unavailable503Wait, { seconds: 5 }));
  });

  it('red caída, tiempo agotado y operación no conectada', () => {
    expect(errorMessage(err(0, { code: 'NETWORK' }))).toBe(e.network);
    expect(errorMessage(err(0, { code: 'TIMEOUT' }))).toBe(e.timeout);
    expect(errorMessage(new NotYetConnectedError('login'))).toBe(e.notConnected);
  });

  it('nunca muestra el detail técnico de la API', () => {
    const technical = 'itineraries[0].departureDate: must not be in the past';
    expect(errorMessage(err(400, { code: 'VALIDATION_FAILED', detail: technical }))).not.toContain('must not');
  });

  it('un error que no es de la API da el mensaje genérico', () => {
    expect(errorMessage(new Error('x'))).toBe(e.unknown);
  });
});

describe('errores por campo de la búsqueda (400 con invalidParams)', () => {
  it('traduce los campos conocidos', () => {
    expect(fieldErrorMessage({ field: 'itineraries[0].departureDate', message: 'must not be in the past' })).toBe(e.fields.datePast);
    expect(fieldErrorMessage({ field: 'itineraries[1].departureDate', message: 'must be a date' })).toBe(e.fields.date);
    expect(fieldErrorMessage({ field: 'itineraries[0].origin', message: 'must match' })).toBe(e.fields.airport);
    expect(fieldErrorMessage({ field: 'passengers.adults', message: 'adults must not be greater than 9' })).toBe(es.validation.maxPassengers);
    expect(fieldErrorMessage({ field: 'X-Device-Fingerprint', message: 'is required' })).toBe(e.fields.other);
  });
});

describe('errores de cuenta (/auth/*)', () => {
  it('401 al ingresar es genérico: no revela si el correo existe', () => {
    expect(authErrorMessage(err(401, { code: 'VALIDATION_FAILED' }), 'login')).toBe(es.auth.invalidCredentials);
  });
  it('409 al registrar = correo ya registrado', () => {
    expect(authErrorMessage(err(409, { code: 'VALIDATION_FAILED' }), 'register')).toBe(es.auth.emailTaken);
  });
  it('429 con el tiempo de espera de Retry-After', () => {
    expect(authErrorMessage(err(429, { retryAfter: 42 }), 'login')).toBe(fmt(es.auth.tooManyAttempts, { seconds: 42 }));
    expect(authErrorMessage(err(429), 'register')).toBe(es.auth.tooManyAttemptsNoTime);
  });
  it('servidor caído y red, con los mensajes generales', () => {
    expect(authErrorMessage(err(503), 'login')).toBe(e.unavailable503);
    expect(authErrorMessage(err(0, { code: 'NETWORK' }), 'login')).toBe(e.network);
  });
  it('400 por campo, en español', () => {
    const bad = err(400, {
      fieldErrors: [
        { field: 'email', message: 'email must be an email' },
        { field: 'password', message: 'password must be longer than or equal to 12 characters' },
      ],
    });
    expect(authFieldErrors(bad)).toEqual({ email: es.validation.emailInvalid, password: es.validation.passwordLength });
    expect(authFieldErrors(err(400, { fieldErrors: [{ field: 'password', message: 'password must be shorter than or equal to 128 characters' }] }))).toEqual({
      password: es.validation.passwordMax,
    });
  });
});
