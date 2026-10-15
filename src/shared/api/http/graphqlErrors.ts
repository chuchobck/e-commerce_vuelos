import { ApiError, type ApiErrorCode, type FieldError } from '../errors';
import { parseRetryAfter } from './problem';

/** Un elemento de `errors[]` de una respuesta GraphQL del BFF (docs/GRAPHQL.md del BFF, sección Errores). */
export interface GraphqlErrorItem {
  message?: string;
  path?: (string | number)[];
  extensions?: {
    code?: string;
    problemCode?: string;
    status?: number;
    requestId?: string;
    retryAfter?: number;
    invalidParams?: { name?: string; reason?: string }[];
  };
}

const SERVER_ERROR_STATUS = 500;

function secondsOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** `invalidParams` del BFF → los mismos errores por campo que da un 400 REST. */
function fieldErrorsOf(error: GraphqlErrorItem): FieldError[] {
  const params = error.extensions?.invalidParams;
  return Array.isArray(params) ? params.map((p) => ({ field: p.name ?? '', message: p.reason ?? '' })) : [];
}

/**
 * `extensions.code` del BFF → el ApiError que la interfaz ya entiende (el mismo que daría REST).
 * El `message` solo va a `detail` (consola de desarrollo): nunca se muestra. `retryAfterHeader` es la
 * cabecera Retry-After del 429, que el BFF expone por CORS.
 */
export function graphqlErrorToApiError(error: GraphqlErrorItem, retryAfterHeader: string | null = null): ApiError {
  const ext = error.extensions ?? {};
  const detail = error.message;
  const retryAfter = secondsOf(ext.retryAfter) ?? parseRetryAfter(retryAfterHeader);
  // El código del ProblemDetails del core, tal cual lo trae REST (p. ej. VALIDATION_FAILED).
  const problemCode = ext.problemCode as ApiErrorCode | undefined;
  switch (ext.code) {
    case 'NOT_FOUND':
      return new ApiError({ status: 404, code: problemCode, detail });
    case 'BAD_USER_INPUT':
      return new ApiError({ status: 400, code: problemCode, detail, fieldErrors: fieldErrorsOf(error) });
    case 'TOO_MANY_REQUESTS':
      return new ApiError({ status: 429, code: problemCode, detail, retryAfter });
    case 'SERVICE_UNAVAILABLE':
      return new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', detail, retryAfter });
    case 'GATEWAY_TIMEOUT':
      return new ApiError({ status: 0, code: 'TIMEOUT', detail });
    case 'QUERY_TOO_EXPENSIVE':
    case 'QUERY_TOO_DEEP':
    case 'GRAPHQL_PARSE_FAILED':
    case 'GRAPHQL_VALIDATION_FAILED':
      // Error del propio cliente (la consulta es nuestra): se ve como una petición inválida.
      return new ApiError({ status: 400, detail });
    default:
      // INTERNAL_SERVER_ERROR y cualquier código que no conozcamos: error genérico del servidor.
      return new ApiError({ status: SERVER_ERROR_STATUS, detail });
  }
}
