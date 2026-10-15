import { describe, expect, it } from 'vitest';
import { errorMessage } from '../errors';
import { graphqlErrorToApiError, type GraphqlErrorItem } from './graphqlErrors';
import { es } from '@/shared/i18n';

const item = (code: string, extensions: GraphqlErrorItem['extensions'] = {}): GraphqlErrorItem => ({
  message: 'mensaje técnico del core',
  extensions: { code, ...extensions },
});

describe('extensions.code → ApiError (una prueba por código)', () => {
  it('NOT_FOUND → 404', () => {
    expect(graphqlErrorToApiError(item('NOT_FOUND', { problemCode: 'VALIDATION_FAILED' }))).toMatchObject({ status: 404, code: 'VALIDATION_FAILED' });
  });

  it('BAD_USER_INPUT → 400, con los campos de invalidParams', () => {
    const error = graphqlErrorToApiError(
      item('BAD_USER_INPUT', { invalidParams: [{ name: 'itineraries[0].departureDate', reason: 'must not be in the past' }] }),
    );
    expect(error.status).toBe(400);
    expect(error.fieldErrors).toEqual([{ field: 'itineraries[0].departureDate', message: 'must not be in the past' }]);
  });

  it('TOO_MANY_REQUESTS → 429 con retryAfter (de extensions o de la cabecera)', () => {
    expect(graphqlErrorToApiError(item('TOO_MANY_REQUESTS', { retryAfter: 12 }))).toMatchObject({ status: 429, retryAfter: 12 });
    expect(graphqlErrorToApiError(item('TOO_MANY_REQUESTS'), '30')).toMatchObject({ status: 429, retryAfter: 30 });
  });

  it('SERVICE_UNAVAILABLE → 503 con retryAfter', () => {
    expect(graphqlErrorToApiError(item('SERVICE_UNAVAILABLE', { retryAfter: 5 }))).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE', retryAfter: 5 });
  });

  it('GATEWAY_TIMEOUT → TIMEOUT', () => {
    expect(graphqlErrorToApiError(item('GATEWAY_TIMEOUT'))).toMatchObject({ status: 0, code: 'TIMEOUT' });
  });

  it('QUERY_TOO_EXPENSIVE → error de cliente (400)', () => {
    expect(graphqlErrorToApiError(item('QUERY_TOO_EXPENSIVE'))).toMatchObject({ status: 400 });
  });

  it('QUERY_TOO_DEEP → error de cliente (400)', () => {
    expect(graphqlErrorToApiError(item('QUERY_TOO_DEEP'))).toMatchObject({ status: 400 });
  });

  it('GRAPHQL_VALIDATION_FAILED y GRAPHQL_PARSE_FAILED → error de cliente (400)', () => {
    expect(graphqlErrorToApiError(item('GRAPHQL_VALIDATION_FAILED'))).toMatchObject({ status: 400 });
    expect(graphqlErrorToApiError(item('GRAPHQL_PARSE_FAILED'))).toMatchObject({ status: 400 });
  });

  it('INTERNAL_SERVER_ERROR → error genérico (500), aunque el core haya dicho 409 o 422', () => {
    expect(graphqlErrorToApiError(item('INTERNAL_SERVER_ERROR', { status: 422 }))).toMatchObject({ status: 500 });
  });

  it('un código desconocido o ausente → error genérico (500)', () => {
    expect(graphqlErrorToApiError(item('ALGO_NUEVO'))).toMatchObject({ status: 500 });
    expect(graphqlErrorToApiError({ message: 'x' })).toMatchObject({ status: 500 });
  });
});

describe('lo que ve el usuario', () => {
  it('cada error cae en un mensaje de es.ts y nunca muestra el detalle técnico', () => {
    const e = es.errors;
    const cases: [GraphqlErrorItem, string][] = [
      [item('NOT_FOUND'), e.notFound404],
      [item('BAD_USER_INPUT'), e.badRequest400],
      [item('SERVICE_UNAVAILABLE'), e.unavailable503],
      [item('GATEWAY_TIMEOUT'), e.timeout],
      [item('QUERY_TOO_EXPENSIVE'), e.badRequest400],
      [item('INTERNAL_SERVER_ERROR'), e.server5xx],
    ];
    for (const [input, expected] of cases) {
      const message = errorMessage(graphqlErrorToApiError(input));
      expect(message).toBe(expected);
      expect(message).not.toContain('mensaje técnico');
    }
    expect(errorMessage(graphqlErrorToApiError(item('TOO_MANY_REQUESTS', { retryAfter: 12 })))).toContain('12');
  });
});
