# Procedencia del contrato

`vuelos-openapi.yaml` es una copia sin cambios del contrato del backend.

| Dato | Valor |
|---|---|
| Fuente | https://raw.githubusercontent.com/chuchobck/backend_vuelos/main/contracts/vuelos-openapi.yaml |
| Repositorio | https://github.com/chuchobck/backend_vuelos |
| Commit del contrato | `bba68bfe7ebe46a1f1815d43c6c72244ec0d16e1` (2026-10-06) |
| Copiado | 2026-10-07 |
| Versión (`info.version`) | 1.5.0.0 |

Diferencias conocidas entre la API real y el contrato: `docs/DISCREPANCIAS-CONTRATO.md` del backend,
más las que encontramos en el frontend (README, sección 6).

Para actualizarlo: descargar de nuevo el archivo, actualizar esta tabla y correr `npm run api:types`.

## OpenAPI del backend (`backend-openapi.json`)

El contrato del equipo no trae la cuenta (`/auth/*`). Sus formas salen del documento que publica el
propio backend (NestJS/Swagger), copiado sin cambios:

| Dato | Valor |
|---|---|
| Fuente | `GET http://localhost:3010/api/docs-json` (backend local) |
| Versión (`info.version`) | 1.0.0 |
| Copiado | 2026-10-07 |

`npm run api:types` genera `src/shared/api/generated/backend.ts`; `src/shared/api/contract.ts` solo
les pone nombre (`RegisterRequestDto`, `TokenResponseDto`, `UserResponseDto`…).
